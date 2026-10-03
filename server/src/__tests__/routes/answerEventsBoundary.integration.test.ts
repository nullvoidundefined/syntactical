// B-32b (trust boundary, B-32, B-36, B-63): POST /v1/answer-events reads its larger 256 KB
// body only after the caller is authenticated and, for a cookie, after the CSRF guard, so an
// anonymous or cross-site caller never makes the server parse more than the app-wide 10 KB.
// Every other route keeps the 10 KB limit. GET /v1/answer-events?after= with a well-shaped
// cursor whose timestamp is not a real instant is 400 INPUT_INVALID_QUERY, never a 500.
import { randomBytes, randomUUID } from 'node:crypto';

import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createApp } from '../../app.js';
import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const AUTH_CODES_ROUTE = '/v1/auth/codes';
const COOKIE_NAME = 'syntactical_session';
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const SETUP_TIMEOUT_MS = 120_000;
const MINUTE_MS = 60_000;
const ANSWERED_MINUTES_AGO = 3;
const APP_BODY_LIMIT_BYTES = 10 * 1024;
const OVERSIZED_PADDING = 20 * 1024;
const MAX_BATCH = 200;
const SECRET_BYTES = 32;
const BANK_KEY = 'python/easy';
const MC_QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const MC_CHOICE_COUNT = 4;
const MC_ANSWER_INDEX = 2;
// Right shape (a uuid and the cursor's timestamp pattern), but month 13, day 45, hour 25.
const IMPOSSIBLE_RECEIVED_AT = '2026-13-45T25:61:61.000000Z';

const answerKey: AnswerKey = new Map([
  [
    BANK_KEY,
    new Map<string, AnswerKeyEntry>(
      MC_QUESTION_IDS.map((id) => [id, { answerIndex: MC_ANSWER_INDEX, choiceCount: MC_CHOICE_COUNT }] as const),
    ),
  ],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

// Opens a JSON array and never closes it, then pads past the app-wide 10 KB: a parser that
// reads it answers 400 INPUT_MALFORMED_JSON, so any other answer means it was never parsed.
function buildMalformedOversizedBody(): string {
  return `{"events": [${'x'.repeat(OVERSIZED_PADDING)}`;
}

function buildBatch(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    answeredAt: new Date(now.getTime() - ANSWERED_MINUTES_AGO * MINUTE_MS - index * 1000).toISOString(),
    bankKey: BANK_KEY,
    choiceIndex: index % MC_CHOICE_COUNT,
    eventId: randomUUID(),
    questionId: MC_QUESTION_IDS[index % MC_QUESTION_IDS.length],
    roundKind: 'bank' as const,
  }));
}

function encodeCursor(cursor: { e: string; r: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

// The app with both the auth routes and the sync routes mounted, so one test can reach a
// route other than the upload route.
function createAuthAndSyncApp() {
  const fixedTime = Date.now();
  function now(): Date {
    return new Date(fixedTime);
  }
  const rateLimitKeySecret = randomBytes(SECRET_BYTES).toString('hex');
  const app = createApp({
    allowedOrigins: [ALLOWED_ORIGIN],
    auth: {
      database: database.pool,
      emailClient: { sendSignInCode: async () => {} },
      isCookieSecure: true,
      now,
      rateLimitKeySecret,
    },
    db: database.pool,
    logger: pino({ level: 'silent' }),
    sync: { answerKey, database: database.pool, now, rateLimitKeySecret },
  });
  return { app, now };
}

describe.skipIf(SKIP_DATABASE_TESTS)('answer-events trust boundary', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers an unauthenticated POST with a malformed body over 10 KB with 401 AUTH_SESSION_REQUIRED, not a parse error', async () => {
    const { app } = createSyncTestApp({ answerKey, pool: database.pool });
    const body = buildMalformedOversizedBody();
    expect(Buffer.byteLength(body)).toBeGreaterThan(APP_BODY_LIMIT_BYTES);

    const response = await request(app).post(ROUTE).set('Content-Type', 'application/json').send(body);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(response.body.error.code).toBe('AUTH_SESSION_REQUIRED');
    expect(response.body.data).toBeUndefined();
  });

  it('answers a cookie POST without X-Requested-With and a malformed body over 10 KB with 403 CSRF_HEADER_MISSING, not a parse error', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    const body = buildMalformedOversizedBody();

    const response = await request(app)
      .post(ROUTE)
      .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(response.body.error.code).toBe('CSRF_HEADER_MISSING');
    const { rows } = await database.pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
      [userId],
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it('still stores a Bearer-authenticated 200-event batch whose body is over 10 KB', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    const events = buildBatch(now(), MAX_BATCH);
    expect(Buffer.byteLength(JSON.stringify({ events }))).toBeGreaterThan(APP_BODY_LIMIT_BYTES);

    const response = await request(app).post(ROUTE).set('Authorization', `Bearer ${sessionToken}`).send({ events });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data.insertedCount).toBe(MAX_BATCH);
    const { rows } = await database.pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
      [userId],
    );
    expect(Number(rows[0].count)).toBe(MAX_BATCH);
  });

  it('still refuses an authenticated JSON body over 10 KB on another route with 413', async () => {
    const { app, now } = createAuthAndSyncApp();
    const { sessionToken } = await insertSession(database.pool, { createdAt: now() });
    const body = { email: `learner-${randomUUID()}@example.com`, padding: 'x'.repeat(OVERSIZED_PADDING) };

    const response = await request(app)
      .post(AUTH_CODES_ROUTE)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(body);

    expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
    expect(response.body.error.code).toBe('INPUT_PAYLOAD_TOO_LARGE');
  });

  it('answers GET with a well-shaped cursor whose timestamp is not a real instant with 400 INPUT_INVALID_QUERY', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken } = await insertSession(database.pool, { createdAt: now() });
    const after = encodeCursor({ e: randomUUID(), r: IMPOSSIBLE_RECEIVED_AT });

    const response = await request(app).get(ROUTE).query({ after }).set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_INVALID_QUERY');
    expect(response.body.data).toBeUndefined();
  });
});
