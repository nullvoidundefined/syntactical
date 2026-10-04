// B-3.3 (B-25, B-26, B-63): POST /v1/auth/codes against a real Postgres. Codes are stored only
// as SHA-256, expire in 10 minutes, replace earlier codes, and are rate limited per normalized
// email and per client IP with atomic counters keyed by HMAC under RATE_LIMIT_KEY_SECRET.
import { createHash, createHmac, randomBytes } from 'node:crypto';

import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { createLogger } from '../../clients/logger.js';
import { deleteRateLimitCountersForEmail } from '../../services/deleteRateLimitCountersForEmail.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const CONCURRENT_REQUESTS = 20;
const CODE_TTL_MS = 600_000;
const WINDOW_MS = 3_600_000;
const SETUP_TIMEOUT_MS = 120_000;
const CODE_UPPER_BOUND = 1_000_000;
const SMALL_CODE = 42;
const PADDED_SMALL_CODE = '000042';
const DISTINCTIVE_CODE = 917_253;
const EMAIL_BYTES = 6;
const IP_OCTET_LIMIT = 250;
const CODE_PATTERN = /^\d{6}$/;
const DEFAULT_IP = '198.51.100.10';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type App = ReturnType<typeof createAuthTestApp>['app'];

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function ipNumber(index: number): string {
  return `192.0.2.${(index % IP_OCTET_LIMIT) + 1}`;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function hmacHex(keySecret: string, value: string): string {
  return createHmac('sha256', keySecret).update(value).digest('hex');
}

function postCode(app: App, email: unknown, ip = DEFAULT_IP) {
  return request(app).post(CODES_ROUTE).set('X-Forwarded-For', ip).send({ email });
}

async function codeRows(pool: pg.Pool) {
  const { rows } = await pool.query<{
    code_hash: Buffer;
    email: string;
    expires_at: Date;
    invalidated_at: Date | null;
    used_at: Date | null;
  }>('SELECT code_hash, email, expires_at, invalidated_at, used_at FROM one_time_codes ORDER BY created_at');
  return rows;
}

async function counterKeys(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ key: string }>('SELECT key FROM rate_limit_counters');
  return rows.map(({ key }) => key);
}

async function allRowsAsText(pool: pg.Pool): Promise<string[]> {
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const texts = await Promise.all(
    tables.map(async ({ table_name: table }) => {
      const { rows } = await pool.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM "${table}" t`);
      return rows.map(({ row }) => row);
    }),
  );
  return texts.flat();
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/codes', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('stores only the SHA-256 of a 6-digit code with a 10-minute expiry and emails the code', async () => {
    const { app, clock, sentCodes } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();

    const response = await postCode(app, email);

    expect(response.status).toBe(HTTP_ACCEPTED);
    expect(sentCodes).toHaveLength(1);
    const [{ code, email: sentTo }] = sentCodes;
    expect(code).toMatch(CODE_PATTERN);
    expect(sentTo).toBe(email);
    const rows = await codeRows(database.pool);
    expect(rows).toHaveLength(1);
    const [{ code_hash: codeHash, expires_at: expiresAt }] = rows;
    expect(codeHash.equals(sha256(code))).toBe(true);
    expect(expiresAt.getTime()).toBe(clock.now().getTime() + CODE_TTL_MS);
  });

  it('draws the code from the injected randomInt over [0, 1_000_000) and zero-pads it to 6 digits', async () => {
    const randomInt = vi.fn((_min: number, _max: number) => SMALL_CODE);
    const { app, sentCodes } = createAuthTestApp({ pool: database.pool, randomInt });

    await postCode(app, buildEmail());

    expect(randomInt).toHaveBeenCalledWith(0, CODE_UPPER_BOUND);
    expect(sentCodes.map(({ code }) => code)).toEqual([PADDED_SMALL_CODE]);
  });

  it('normalizes the email (trim, NFKC, lowercase) before the rate-limit key and the stored row', async () => {
    const { app, sentCodes } = createAuthTestApp({ pool: database.pool });
    const variants = [
      'Foo@Example.com',
      'FOO@example.com',
      'foo@example.com ',
      'ｆoo@example.com',
      '  fOo@EXAMPLE.com',
    ];

    const statuses = [];
    for (const [index, variant] of variants.entries()) {
      // Sequential on purpose: each request must see the previous count.
      statuses.push((await postCode(app, variant, ipNumber(index))).status);
    }
    const sixth = await postCode(app, 'FoO@ExAmPlE.CoM', ipNumber(variants.length));

    expect(statuses).toEqual(variants.map(() => HTTP_ACCEPTED));
    expect(sixth.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(new Set(sentCodes.map(({ email }) => email))).toEqual(new Set(['foo@example.com']));
    const rows = await codeRows(database.pool);
    expect(new Set(rows.map(({ email }) => email))).toEqual(new Set(['foo@example.com']));
  });

  it('counts atomically: 20 concurrent requests for one email send exactly 5 codes', async () => {
    const { app, sentCodes } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_unused, index) => postCode(app, email, ipNumber(index))),
    );

    const accepted = responses.filter(({ status }) => status === HTTP_ACCEPTED);
    const limited = responses.filter(({ status }) => status === HTTP_TOO_MANY_REQUESTS);
    expect(accepted).toHaveLength(EMAIL_LIMIT);
    expect(limited).toHaveLength(CONCURRENT_REQUESTS - EMAIL_LIMIT);
    expect(sentCodes).toHaveLength(EMAIL_LIMIT);
  });

  it('answers the 6th request for one email within the hour with 429, and resets after the window', async () => {
    const { app, clock } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();

    for (let index = 0; index < EMAIL_LIMIT; index += 1) {
      expect((await postCode(app, email, ipNumber(index))).status).toBe(HTTP_ACCEPTED);
    }
    const limited = await postCode(app, email, ipNumber(EMAIL_LIMIT));
    clock.advance(WINDOW_MS);
    const afterWindow = await postCode(app, email, ipNumber(EMAIL_LIMIT));

    expect(limited.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(afterWindow.status).toBe(HTTP_ACCEPTED);
  });

  it('answers the 21st request from one IP within the hour with 429, and resets after the window', async () => {
    const { app, clock } = createAuthTestApp({ pool: database.pool });

    for (let index = 0; index < IP_LIMIT; index += 1) {
      expect((await postCode(app, buildEmail())).status).toBe(HTTP_ACCEPTED);
    }
    const limited = await postCode(app, buildEmail());
    clock.advance(WINDOW_MS);
    const afterWindow = await postCode(app, buildEmail());

    expect(limited.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(afterWindow.status).toBe(HTTP_ACCEPTED);
  });

  it('counts two different client IPs in separate buckets', async () => {
    const { app } = createAuthTestApp({ pool: database.pool });

    for (let index = 0; index < IP_LIMIT; index += 1) {
      await postCode(app, buildEmail(), '203.0.113.7');
    }
    const sameClient = await postCode(app, buildEmail(), '203.0.113.7');
    const otherClient = await postCode(app, buildEmail(), '203.0.113.8');

    expect(sameClient.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(otherClient.status).toBe(HTTP_ACCEPTED);
  });

  it('keys the IP by the one trusted proxy hop, so spoofed X-Forwarded-For entries change nothing', async () => {
    const { app } = createAuthTestApp({ pool: database.pool });
    const trustedHop = '198.51.100.77';

    for (let index = 0; index < IP_LIMIT; index += 1) {
      await postCode(app, buildEmail(), `${ipNumber(index)}, 10.0.0.${index + 1}, ${trustedHop}`);
    }
    const spoofed = await postCode(app, buildEmail(), `203.0.113.99, ${trustedHop}`);
    const otherClient = await postCode(app, buildEmail(), `${trustedHop}, 198.51.100.78`);

    expect(spoofed.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(otherClient.status).toBe(HTTP_ACCEPTED);
  });

  it('stores counter keys as HMACs under the secret, never the plaintext email or IP or their SHA-256', async () => {
    const { app, rateLimitKeySecret } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();

    await postCode(app, email, DEFAULT_IP);

    const keys = await counterKeys(database.pool);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain(email);
      expect(key).not.toContain(DEFAULT_IP);
      expect(key).not.toContain(sha256(email).toString('hex'));
      expect(key).not.toContain(sha256(DEFAULT_IP).toString('hex'));
    }
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, email)))).toBe(true);
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, DEFAULT_IP)))).toBe(true);
  });

  it('deletes counter rows older than the window on the next insert', async () => {
    const { app, clock, rateLimitKeySecret } = createAuthTestApp({ pool: database.pool });
    const firstEmail = buildEmail();
    const firstIp = '198.51.100.21';

    await postCode(app, firstEmail, firstIp);
    clock.advance(WINDOW_MS);
    await postCode(app, buildEmail(), '198.51.100.22');

    const keys = await counterKeys(database.pool);
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, firstEmail)))).toBe(false);
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, firstIp)))).toBe(false);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('deletes the counter rows keyed by an email on request (account deletion), leaving others', async () => {
    const { app, rateLimitKeySecret } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const otherEmail = buildEmail();
    await postCode(app, `  ${email.toUpperCase()}`, DEFAULT_IP);
    await postCode(app, otherEmail, DEFAULT_IP);

    await deleteRateLimitCountersForEmail(database.pool, rateLimitKeySecret, email);

    const keys = await counterKeys(database.pool);
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, email)))).toBe(false);
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, otherEmail)))).toBe(true);
    expect(keys.some((key) => key.endsWith(hmacHex(rateLimitKeySecret, DEFAULT_IP)))).toBe(true);
  });

  it('rejects text/plain, urlencoded, and multipart bodies with 415 and accepts JSON with a charset', async () => {
    const { app } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();

    const plain = await request(app).post(CODES_ROUTE).set('Content-Type', 'text/plain').send(JSON.stringify({ email }));
    const form = await request(app).post(CODES_ROUTE).type('form').send({ email });
    const multipart = await request(app).post(CODES_ROUTE).field('email', email);
    const json = await request(app)
      .post(CODES_ROUTE)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ email }));

    expect([plain.status, form.status, multipart.status]).toEqual([
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      HTTP_UNSUPPORTED_MEDIA_TYPE,
    ]);
    expect(json.status).toBe(HTTP_ACCEPTED);
  });

  it('keeps the plaintext code out of every table and every log line', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      destination: {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    });
    const { app, sentCodes } = createAuthTestApp({
      logger,
      pool: database.pool,
      randomInt: () => DISTINCTIVE_CODE,
    });
    const email = buildEmail();

    await postCode(app, email);

    const [{ code }] = sentCodes;
    expect(code).toBe(String(DISTINCTIVE_CODE));
    const rows = await allRowsAsText(database.pool);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toContain(code);
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(code);
      expect(line).not.toContain(email);
    }
  });

  it.each([['not-an-email'], [''], [123], [null]])('answers a malformed email %j with 400', async (email) => {
    const { app, sentCodes } = createAuthTestApp({ pool: database.pool });

    const response = await postCode(app, email);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(sentCodes).toHaveLength(0);
  });

  it('answers an existing and a new email with the identical status and body', async () => {
    const { app } = createAuthTestApp({ pool: database.pool });
    const existing = buildEmail();
    await database.pool.query('INSERT INTO users (email) VALUES ($1)', [existing]);

    const forExisting = await postCode(app, existing);
    const forNew = await postCode(app, buildEmail());

    expect(forExisting.status).toBe(HTTP_ACCEPTED);
    expect(forNew.status).toBe(forExisting.status);
    expect(forNew.text).toBe(forExisting.text);
  });

  it('answers 503 and leaves no usable code row when the email send fails', async () => {
    const { app } = createAuthTestApp({
      pool: database.pool,
      async sendSignInCode() {
        throw new Error('resend unavailable');
      },
    });

    const response = await postCode(app, buildEmail());

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const usable = (await codeRows(database.pool)).filter(
      ({ invalidated_at: invalidatedAt, used_at: usedAt }) => invalidatedAt === null && usedAt === null,
    );
    expect(usable).toHaveLength(0);
  });

  it('invalidates earlier unused codes for the email when a new code is issued', async () => {
    const { app, sentCodes } = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();

    await postCode(app, email);
    await postCode(app, ` ${email.toUpperCase()}`);

    const rows = await codeRows(database.pool);
    expect(rows).toHaveLength(2);
    const usable = rows.filter(({ invalidated_at: invalidatedAt }) => invalidatedAt === null);
    expect(usable).toHaveLength(1);
    const [{ code_hash: usableHash }] = usable;
    const [, second] = sentCodes;
    expect(usableHash.equals(sha256(second.code))).toBe(true);
  });
});
