// Guards for behavior that landed with B-32b (B-32, B-36): the upload route reads up to 256 KB
// after authentication, so a body between express's 100 KB default and 256 KB is stored and
// one over 256 KB is 413 INPUT_PAYLOAD_TOO_LARGE with nothing stored; malformed JSON reaching
// that parser, by Bearer or by a cookie that passed the CSRF guard, is 400
// INPUT_MALFORMED_JSON. On download, a well-shaped cursor whose date is not a real instant is
// 400 INPUT_INVALID_QUERY, and a real cursor whose received_at carries microseconds pages on
// without skipping or repeating a row.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import type { AnswerKeyEntry } from '../../types/AnswerKeyEntry.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const COOKIE_NAME = 'syntactical_session';
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const SETUP_TIMEOUT_MS = 120_000;
const MINUTE_MS = 60_000;
const ANSWERED_MINUTES_AGO = 3;
const KB = 1024;
const EXPRESS_DEFAULT_LIMIT_BYTES = 100 * KB;
const ROUTE_LIMIT_BYTES = 256 * KB;
const UNDER_ROUTE_LIMIT_PADDING = 150 * KB;
const OVER_ROUTE_LIMIT_PADDING = 300 * KB;
const BATCH_SIZE = 20;
const PAGE_SIZE = 500;
const SEEDED_EVENTS = 503;
// Each seeded row's received_at is this many microseconds after the last, from an odd start,
// so every row (the page's last row included) has non-zero microseconds and rows share
// milliseconds: a cursor truncated to milliseconds would skip or repeat rows.
const MICROSECOND_STEP = 7;
const MICROSECOND_START = 13;
const BANK_KEY = 'python/easy';
const MC_QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const MC_CHOICE_COUNT = 4;
const MC_ANSWER_INDEX = 2;

const answerKey: AnswerKey = new Map([
  [
    BANK_KEY,
    new Map<string, AnswerKeyEntry>(
      MC_QUESTION_IDS.map((id) => [id, { answerIndex: MC_ANSWER_INDEX, choiceCount: MC_CHOICE_COUNT }] as const),
    ),
  ],
]);

interface PageBody {
  data: { events: Array<{ eventId: string }>; nextCursor: string | null };
}

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

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

// A valid upload body whose size comes from insignificant JSON whitespace before the closing
// brace, so the parsed value is the same small batch whatever the padding.
function buildPaddedBody(events: ReturnType<typeof buildBatch>, padding: number): string {
  return `{"events": ${JSON.stringify(events)}${' '.repeat(padding)}}`;
}

function encodeCursor(cursor: { e: string; r: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

async function countEvents(userId: string): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0].count);
}

// Seeds count rows whose received_at values step by MICROSECOND_STEP microseconds; returns the
// event ids in received_at order.
async function seedMicrosecondEvents(userId: string, base: Date, count: number): Promise<string[]> {
  const { rows } = await database.pool.query<{ event_id: string }>(
    `INSERT INTO answer_events
       (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, received_at)
     SELECT $1, gen_random_uuid(), $2, $3, 0, $4::timestamptz, 'bank', false,
            $4::timestamptz + make_interval(secs => ($5 + i * $6) / 1000000.0)
       FROM generate_series(0, $7 - 1) AS i
     RETURNING event_id, received_at`,
    [userId, BANK_KEY, MC_QUESTION_IDS[0], base.toISOString(), MICROSECOND_START, MICROSECOND_STEP, count],
  );
  const { rows: ordered } = await database.pool.query<{ event_id: string }>(
    'SELECT event_id FROM answer_events WHERE user_id = $1 ORDER BY received_at, event_id',
    [userId],
  );
  expect(rows).toHaveLength(count);
  return ordered.map((row) => row.event_id);
}

describe.skipIf(SKIP_DATABASE_TESTS)('answer-events body limits and cursor guards (B-32b)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers a Bearer upload over 256 KB with 413 INPUT_PAYLOAD_TOO_LARGE and stores nothing', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    const body = buildPaddedBody(buildBatch(now(), BATCH_SIZE), OVER_ROUTE_LIMIT_PADDING);
    expect(Buffer.byteLength(body)).toBeGreaterThan(ROUTE_LIMIT_BYTES);

    const response = await request(app)
      .post(ROUTE)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
    expect(response.body.error.code).toBe('INPUT_PAYLOAD_TOO_LARGE');
    expect(await countEvents(userId)).toBe(0);
  });

  it('stores a valid Bearer upload between 100 KB and 256 KB', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    const body = buildPaddedBody(buildBatch(now(), BATCH_SIZE), UNDER_ROUTE_LIMIT_PADDING);
    expect(Buffer.byteLength(body)).toBeGreaterThan(EXPRESS_DEFAULT_LIMIT_BYTES);
    expect(Buffer.byteLength(body)).toBeLessThan(ROUTE_LIMIT_BYTES);

    const response = await request(app)
      .post(ROUTE)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data.insertedCount).toBe(BATCH_SIZE);
    expect(await countEvents(userId)).toBe(BATCH_SIZE);
  });

  it('answers a Bearer upload of malformed JSON with 400 INPUT_MALFORMED_JSON', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });

    const response = await request(app)
      .post(ROUTE)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Content-Type', 'application/json')
      .send('{"events": [');

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_MALFORMED_JSON');
    expect(await countEvents(userId)).toBe(0);
  });

  it('answers a cookie upload that passes the CSRF guard with malformed JSON with 400 INPUT_MALFORMED_JSON', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });

    const response = await request(app)
      .post(ROUTE)
      .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"events": [');

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_MALFORMED_JSON');
    expect(await countEvents(userId)).toBe(0);
  });

  it.each([
    ['February 30', '2026-02-30T00:00:00.000000Z'],
    ['a leap second', '2026-01-01T23:59:60.000000Z'],
    ['hour 24', '2026-01-01T24:00:00.000000Z'],
  ])('answers a cursor dated %s with 400 INPUT_INVALID_QUERY', async (_label: string, receivedAt: string) => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken } = await insertSession(database.pool, { createdAt: now() });
    const after = encodeCursor({ e: randomUUID(), r: receivedAt });

    const response = await request(app).get(ROUTE).query({ after }).set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_INVALID_QUERY');
    expect(response.body.data).toBeUndefined();
  });

  it('pages on from a real cursor whose last row has non-zero microseconds without skipping or repeating', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now() });
    const expectedIds = await seedMicrosecondEvents(userId, new Date(now().getTime() - MINUTE_MS), SEEDED_EVENTS);
    const { rows } = await database.pool.query<{ micros: number }>(
      `SELECT (EXTRACT(MICROSECONDS FROM received_at)::bigint % 1000)::int AS micros
         FROM answer_events WHERE user_id = $1 AND event_id = $2`,
      [userId, expectedIds[PAGE_SIZE - 1]],
    );
    expect(rows[0].micros).not.toBe(0);

    const first = await request(app).get(ROUTE).set('Authorization', `Bearer ${sessionToken}`);
    expect(first.status).toBe(HTTP_OK);
    const firstBody = first.body as PageBody;
    expect(firstBody.data.events).toHaveLength(PAGE_SIZE);
    expect(typeof firstBody.data.nextCursor).toBe('string');

    const second = await request(app)
      .get(ROUTE)
      .query({ after: firstBody.data.nextCursor as string })
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(second.status).toBe(HTTP_OK);
    const secondBody = second.body as PageBody;
    expect(secondBody.data.nextCursor).toBeNull();

    const returnedIds = [...firstBody.data.events, ...secondBody.data.events].map((event) => event.eventId);
    expect(returnedIds).toEqual(expectedIds);
  });
});
