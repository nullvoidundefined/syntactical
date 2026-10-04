// B-3.4 (B-27, B-28): POST /v1/auth/sessions against a real Postgres. A correct, unexpired,
// unused code creates the user on first sign-in and a session stored only as SHA-256; web
// gets an HttpOnly cookie, native gets the token in the body. Every bad code gets one body.
import { createHash, randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const SESSIONS_ROUTE = '/v1/auth/sessions';
const COOKIE_NAME = 'syntactical_session';
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const SETUP_TIMEOUT_MS = 120_000;
const SESSION_TTL_MS = 2_592_000_000;
const SESSION_MAX_AGE_SECONDS = 2_592_000;
const CODE_TTL_MS = 600_000;
const MAX_ATTEMPTS = 5;
const VERIFY_PER_EMAIL = 10;
const VERIFY_PER_IP = 30;
const TOKEN_BYTES = 32;
const EMAIL_BYTES = 6;
const IP_OCTET_LIMIT = 250;
const CODE_SPACE = 1_000_000;
const INVALID_CODE = 'AUTH_INVALID_CODE';
const TIMEZONE = 'Europe/London';
const OTHER_TIMEZONE = 'Pacific/Auckland';
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]{43}$/;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function ipNumber(index: number): string {
  return `192.0.2.${(index % IP_OCTET_LIMIT) + 1}`;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function otherCode(code: string, offset = 1): string {
  return String((Number(code) + offset) % CODE_SPACE).padStart(code.length, '0');
}

async function issueCode({ app, sentCodes }: TestApp, email: string, ip = ipNumber(0)): Promise<string> {
  await request(app).post(CODES_ROUTE).set('X-Forwarded-For', ip).send({ email });
  const { code } = sentCodes[sentCodes.length - 1];
  return code;
}

function signIn(
  { app }: TestApp,
  body: Record<string, unknown>,
  { ip = ipNumber(1), isNative = false }: { ip?: string; isNative?: boolean } = {},
) {
  const pending = request(app).post(SESSIONS_ROUTE).set('X-Forwarded-For', ip).set('X-Requested-With', 'XMLHttpRequest');
  return (isNative ? pending.set('X-Client', 'native') : pending).send(body);
}

function sessionCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

function cookieToken(cookie: string): string {
  return cookie.slice(COOKIE_NAME.length + 1, cookie.indexOf(';'));
}

function bodyToken(response: request.Response): string {
  const { data } = response.body as { data: Record<string, unknown> };
  return String(data.token);
}

async function codeAttempts(email: string): Promise<number> {
  const { rows } = await database.pool.query<{ attempts: number }>(
    'SELECT attempts FROM one_time_codes WHERE email = $1 AND invalidated_at IS NULL',
    [email],
  );
  const [{ attempts }] = rows;
  return attempts;
}

async function sessionCount(): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT count(*) FROM sessions');
  const [{ count }] = rows;
  return Number(count);
}

function errorShape(response: request.Response) {
  const { code, message } = response.body.error as { code: string; message: string };
  return { code, message, status: response.status };
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/sessions', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('creates the user with its timezone and a 30-day session stored as SHA-256, and marks the code used', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const response = await signIn(testApp, { code, email, timezone: TIMEZONE });

    expect(response.status).toBe(HTTP_CREATED);
    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    const sessionToken = cookieToken(String(cookie));
    expect(sessionToken).toMatch(BASE64URL_TOKEN);
    expect(Buffer.from(sessionToken, 'base64url')).toHaveLength(TOKEN_BYTES);
    const { rows: users } = await database.pool.query<{ id: string; timezone: string }>(
      'SELECT id, timezone FROM users WHERE email = $1',
      [email],
    );
    expect(users).toHaveLength(1);
    const [{ id: userId, timezone }] = users;
    expect(timezone).toBe(TIMEZONE);
    const { rows: sessions } = await database.pool.query<{
      expires_at: Date;
      last_used_at: Date;
      token_hash: Buffer;
      user_id: string;
    }>('SELECT expires_at, last_used_at, token_hash, user_id FROM sessions');
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session.token_hash.equals(sha256(sessionToken))).toBe(true);
    expect(session.user_id).toBe(userId);
    expect(session.expires_at.getTime()).toBe(testApp.clock.now().getTime() + SESSION_TTL_MS);
    expect(session.last_used_at.getTime()).toBe(testApp.clock.now().getTime());
    const { rows: codes } = await database.pool.query<{ used_at: Date | null }>(
      'SELECT used_at FROM one_time_codes WHERE email = $1',
      [email],
    );
    expect(codes.map(({ used_at: usedAt }) => usedAt !== null)).toEqual([true]);
  });

  it('sets an HttpOnly, Secure, SameSite=Lax, Path=/ cookie with a 30-day Max-Age and no token in the body', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const response = await signIn(testApp, { code, email });

    const cookie = String(sessionCookie(response));
    const attributes = cookie.split(';').map((part) => part.trim().toLowerCase());
    expect(attributes).toContain('httponly');
    expect(attributes).toContain('secure');
    expect(attributes).toContain('samesite=lax');
    expect(attributes).toContain('path=/');
    expect(attributes).toContain(`max-age=${SESSION_MAX_AGE_SECONDS}`);
    expect(attributes.some((attribute) => attribute.startsWith('domain='))).toBe(false);
    expect(response.text).not.toContain(cookieToken(cookie));
  });

  it('omits Secure only when the app is built with an insecure cookie (NODE_ENV=test)', async () => {
    const testApp = createAuthTestApp({ isCookieSecure: false, pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const response = await signIn(testApp, { code, email });

    const attributes = String(sessionCookie(response))
      .split(';')
      .map((part) => part.trim().toLowerCase());
    expect(attributes).toContain('httponly');
    expect(attributes).not.toContain('secure');
  });

  it('gives a native client (X-Client: native) the token in the body and sets no cookie', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const response = await signIn(testApp, { code, email }, { isNative: true });

    expect(response.status).toBe(HTTP_CREATED);
    expect(response.headers['set-cookie']).toBeUndefined();
    const nativeToken = bodyToken(response);
    expect(nativeToken).toMatch(BASE64URL_TOKEN);
    const { rows } = await database.pool.query<{ token_hash: Buffer }>('SELECT token_hash FROM sessions');
    const [{ token_hash: tokenHash }] = rows;
    expect(tokenHash.equals(sha256(nativeToken))).toBe(true);
  });

  it('stores no timezone that is not a valid IANA zone, and never replaces a stored one', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const invalidZoneEmail = buildEmail();
    const keptZoneEmail = buildEmail();

    await signIn(testApp, {
      code: await issueCode(testApp, invalidZoneEmail),
      email: invalidZoneEmail,
      timezone: 'Mars/Olympus_Mons',
    });
    await signIn(testApp, { code: await issueCode(testApp, keptZoneEmail), email: keptZoneEmail, timezone: TIMEZONE });
    const second = await signIn(testApp, {
      code: await issueCode(testApp, keptZoneEmail),
      email: keptZoneEmail,
      timezone: OTHER_TIMEZONE,
    });

    expect(second.status).toBe(HTTP_CREATED);
    const { rows } = await database.pool.query<{ email: string; timezone: string | null }>(
      'SELECT email, timezone FROM users',
    );
    const zones = Object.fromEntries(rows.map(({ email, timezone }) => [email, timezone]));
    expect(zones).toEqual({ [invalidZoneEmail]: null, [keptZoneEmail]: TIMEZONE });
  });

  it('answers reused, expired, invalidated, and wrong codes with one identical 400 body', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const reusedEmail = buildEmail();
    const reusedCode = await issueCode(testApp, reusedEmail);
    await signIn(testApp, { code: reusedCode, email: reusedEmail });
    const invalidatedEmail = buildEmail();
    const invalidatedCode = await issueCode(testApp, invalidatedEmail);
    await issueCode(testApp, invalidatedEmail);
    const wrongEmail = buildEmail();
    const wrongCode = otherCode(await issueCode(testApp, wrongEmail));
    const expiredEmail = buildEmail();
    const expiredCode = await issueCode(testApp, expiredEmail);
    testApp.clock.advance(CODE_TTL_MS);

    const responses = [
      await signIn(testApp, { code: reusedCode, email: reusedEmail }),
      await signIn(testApp, { code: invalidatedCode, email: invalidatedEmail }),
      await signIn(testApp, { code: wrongCode, email: wrongEmail }),
      await signIn(testApp, { code: expiredCode, email: expiredEmail }),
      await signIn(testApp, { code: reusedCode, email: buildEmail() }),
    ];

    const shapes = responses.map(errorShape);
    expect(shapes[0]).toEqual({ code: INVALID_CODE, message: expect.any(String), status: HTTP_BAD_REQUEST });
    for (const shape of shapes) {
      expect(shape).toEqual(shapes[0]);
    }
    expect(responses.every((response) => sessionCookie(response) === undefined)).toBe(true);
    expect(await sessionCount()).toBe(1);
  });

  it('accepts the right code after 4 wrong attempts, and exhausts the code on the 5th wrong attempt', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const savedEmail = buildEmail();
    const savedCode = await issueCode(testApp, savedEmail);
    const exhaustedEmail = buildEmail();
    const exhaustedCode = await issueCode(testApp, exhaustedEmail);

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      await signIn(testApp, { code: otherCode(savedCode, attempt), email: savedEmail });
    }
    const saved = await signIn(testApp, { code: savedCode, email: savedEmail });
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await signIn(testApp, { code: otherCode(exhaustedCode, attempt), email: exhaustedEmail });
    }
    const exhausted = await signIn(testApp, { code: exhaustedCode, email: exhaustedEmail });

    expect(saved.status).toBe(HTTP_CREATED);
    expect(errorShape(exhausted)).toMatchObject({ code: INVALID_CODE, status: HTTP_BAD_REQUEST });
    expect(await codeAttempts(exhaustedEmail)).toBe(MAX_ATTEMPTS);
  });

  it('verifies a code under any casing and spacing of the email, counting every guess against one code', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const local = randomBytes(EMAIL_BYTES).toString('hex');
    const email = `foo-${local}@example.com`;
    const code = await issueCode(testApp, email);

    await signIn(testApp, { code: otherCode(code, 1), email: `Foo-${local}@Example.com` });
    await signIn(testApp, { code: otherCode(code, 2), email: ` FOO-${local}@EXAMPLE.COM ` });
    const attemptsAfterGuesses = await codeAttempts(email);
    const accepted = await signIn(testApp, { code, email: `FOO-${local}@example.com ` });

    expect(attemptsAfterGuesses).toBe(2);
    expect(accepted.status).toBe(HTTP_CREATED);
  });

  it('creates exactly one session when two requests race with the same correct code', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const responses = await Promise.all([signIn(testApp, { code, email }), signIn(testApp, { code, email })]);

    expect(responses.map(({ status }) => status).sort()).toEqual([HTTP_CREATED, HTTP_BAD_REQUEST]);
    expect(await sessionCount()).toBe(1);
  });

  it('answers the 11th verify for one email and the 31st from one IP within the hour with 429', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);
    for (let attempt = 1; attempt <= VERIFY_PER_EMAIL; attempt += 1) {
      await signIn(testApp, { code: otherCode(code, attempt), email }, { ip: ipNumber(attempt) });
    }
    const emailLimited = await signIn(testApp, { code, email }, { ip: ipNumber(0) });

    const sharedIp = '198.51.100.99';
    for (let attempt = 0; attempt < VERIFY_PER_IP; attempt += 1) {
      await signIn(testApp, { code: '000000', email: buildEmail() }, { ip: sharedIp });
    }
    const ipLimited = await signIn(testApp, { code: '000000', email: buildEmail() }, { ip: sharedIp });

    expect(emailLimited.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(ipLimited.status).toBe(HTTP_TOO_MANY_REQUESTS);
  });

  it('counts two different client IPs in separate verify buckets', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const busyIp = '198.51.100.50';
    for (let attempt = 0; attempt < VERIFY_PER_IP; attempt += 1) {
      await signIn(testApp, { code: '000000', email: buildEmail() }, { ip: busyIp });
    }

    const sameClient = await signIn(testApp, { code: '000000', email: buildEmail() }, { ip: busyIp });
    const otherClient = await signIn(testApp, { code: '000000', email: buildEmail() }, { ip: '198.51.100.51' });

    expect(sameClient.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(otherClient.status).not.toBe(HTTP_TOO_MANY_REQUESTS);
  });

  it('answers a malformed code or email with 400 before touching the code', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const responses = await Promise.all([
      signIn(testApp, { code: '12345', email }),
      signIn(testApp, { code: 'abcdef', email }),
      signIn(testApp, { code: Number(code), email }),
      signIn(testApp, { code, email: 'not-an-email' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual(responses.map(() => HTTP_BAD_REQUEST));
    expect(await codeAttempts(email)).toBe(0);
  });

  it('keeps the session token, the Set-Cookie header, the email, and the code out of every log line', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      destination: {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    });
    const testApp = createAuthTestApp({ logger, pool: database.pool });
    const email = buildEmail();
    const code = await issueCode(testApp, email);

    const web = await signIn(testApp, { code, email });
    const native = await signIn(testApp, { code: await issueCode(testApp, email), email }, { isNative: true });

    const webToken = cookieToken(String(sessionCookie(web)));
    const nativeToken = bodyToken(native);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(webToken);
      expect(line).not.toContain(nativeToken);
      expect(line).not.toContain(email);
      expect(line).not.toContain(code);
      expect(line.toLowerCase()).not.toContain('set-cookie');
    }
  });
});
