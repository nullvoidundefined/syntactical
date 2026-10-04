// B-36 (server side): GET /v1/answer-events?after=<cursor> pages through the caller's stored
// answer events, at most 500 per page, ordered by received_at then event_id, with an opaque
// nextCursor that is null after the last page; another user's events never appear, even when
// the caller passes a cursor taken from that user's page; a malformed cursor is 400
// INPUT_INVALID_QUERY; no session is 401. Rows are seeded directly with controlled
// received_at values, including ties that straddle a page boundary so event_id decides.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const SETUP_TIMEOUT_MS = 120_000;
const PAGING_TIMEOUT_MS = 60_000;
const PAGE_SIZE = 500;
const TOTAL_EVENTS = 1_200;
const LAST_PAGE_SIZE = 200;
// Seven events share each received_at, so 500 (71 groups and 3 events) splits a tie group.
const TIE_GROUP_SIZE = 7;
const SECOND_MS = 1_000;
const DAY_MS = 86_400_000;
const OVERSIZED_LENGTH = 10_000;
const ROUND_KINDS = ['bank', 'topic', 'review'] as const;
const BANK_KEYS = ['python/easy', 'python/medium', 'javascript/hard'] as const;

// The download route never consults the answer key; an empty one is enough to build the app.
const answerKey: AnswerKey = new Map();

type RoundKind = (typeof ROUND_KINDS)[number];

interface SeedEvent {
  answeredAt: Date;
  bankKey: string;
  choiceIndex: number;
  eventId: string;
  isCorrect: boolean;
  questionId: string;
  receivedAt: Date;
  roundKind: RoundKind;
}

interface WireEvent {
  answeredAt: string;
  bankKey: string;
  choiceIndex: number;
  eventId: string;
  isCorrect: boolean;
  questionId: string;
  roundKind: RoundKind;
}

interface PageBody {
  data: { events: WireEvent[]; nextCursor: string | null };
}

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

// count events whose received_at values run in tie groups from baseMs, offset by offsetMs so
// two users' events can interleave; answered_at, choice, bank, round kind, and correctness vary.
function buildSeedEvents(count: number, baseMs: number, offsetMs = 0): SeedEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    answeredAt: new Date(baseMs - DAY_MS + index * SECOND_MS + (index % 997)),
    bankKey: BANK_KEYS[index % BANK_KEYS.length],
    choiceIndex: index % 4,
    eventId: randomUUID(),
    isCorrect: index % 3 === 0,
    questionId: `q-${String(index).padStart(4, '0')}`,
    receivedAt: new Date(baseMs + offsetMs + Math.floor(index / TIE_GROUP_SIZE) * SECOND_MS),
    roundKind: ROUND_KINDS[index % ROUND_KINDS.length],
  }));
}

// The order the route must return: received_at, then event_id (lowercase uuid text order
// matches Postgres uuid order).
function expectedOrder(events: SeedEvent[]): SeedEvent[] {
  return [...events].sort((left, right) => {
    const byReceived = left.receivedAt.getTime() - right.receivedAt.getTime();
    if (byReceived !== 0) {
      return byReceived;
    }
    if (left.eventId === right.eventId) {
      return 0;
    }
    return left.eventId < right.eventId ? -1 : 1;
  });
}

// Inserted in reverse of the expected order so physical row order cannot stand in for ORDER BY.
async function seedEvents(userId: string, events: SeedEvent[]): Promise<void> {
  const rows = [...expectedOrder(events)].reverse();
  await database.pool.query(
    `INSERT INTO answer_events
       (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, received_at)
     SELECT $1, e.event_id, e.bank_key, e.question_id, e.choice_index, e.answered_at, e.round_kind, e.is_correct,
            e.received_at
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::timestamptz[], $7::text[], $8::boolean[],
                   $9::timestamptz[])
         AS e(event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, received_at)`,
    [
      userId,
      rows.map((row) => row.eventId),
      rows.map((row) => row.bankKey),
      rows.map((row) => row.questionId),
      rows.map((row) => row.choiceIndex),
      rows.map((row) => row.answeredAt.toISOString()),
      rows.map((row) => row.roundKind),
      rows.map((row) => row.isCorrect),
      rows.map((row) => row.receivedAt.toISOString()),
    ],
  );
}

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
  const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now });
  return { authorization: `Bearer ${sessionToken}`, userId };
}

function fetchPage(app: Parameters<typeof request>[0], authorization: string, after?: string) {
  const call = request(app).get(ROUTE).set('Authorization', authorization);
  return after === undefined ? call : call.query({ after });
}

function toWire(event: SeedEvent): Omit<WireEvent, 'answeredAt'> & { answeredAtMs: number } {
  return {
    answeredAtMs: event.answeredAt.getTime(),
    bankKey: event.bankKey,
    choiceIndex: event.choiceIndex,
    eventId: event.eventId,
    isCorrect: event.isCorrect,
    questionId: event.questionId,
    roundKind: event.roundKind,
  };
}

function fromResponse(event: WireEvent): Omit<WireEvent, 'answeredAt'> & { answeredAtMs: number } {
  const { answeredAt, ...rest } = event;
  return { ...rest, answeredAtMs: Date.parse(answeredAt) };
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

describe.skipIf(SKIP_DATABASE_TESTS)('GET /v1/answer-events', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it(
    'pages 1,200 events as 500, 500, then 200 with a null nextCursor, every event once, in received_at, event_id order',
    async () => {
      const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
      const { authorization, userId } = await signIn(now());
      const seeded = buildSeedEvents(TOTAL_EVENTS, now().getTime() - DAY_MS);
      await seedEvents(userId, seeded);

      const first = await fetchPage(app, authorization);
      expect(first.status).toBe(HTTP_OK);
      const firstBody = first.body as PageBody;
      expect(firstBody.data.events).toHaveLength(PAGE_SIZE);
      expect(typeof firstBody.data.nextCursor).toBe('string');

      const second = await fetchPage(app, authorization, firstBody.data.nextCursor as string);
      expect(second.status).toBe(HTTP_OK);
      const secondBody = second.body as PageBody;
      expect(secondBody.data.events).toHaveLength(PAGE_SIZE);
      expect(typeof secondBody.data.nextCursor).toBe('string');

      const third = await fetchPage(app, authorization, secondBody.data.nextCursor as string);
      expect(third.status).toBe(HTTP_OK);
      const thirdBody = third.body as PageBody;
      expect(thirdBody.data.events).toHaveLength(LAST_PAGE_SIZE);
      expect(thirdBody.data.nextCursor).toBeNull();

      const returnedIds = [...firstBody.data.events, ...secondBody.data.events, ...thirdBody.data.events].map(
        (event) => event.eventId,
      );
      expect(new Set(returnedIds).size).toBe(TOTAL_EVENTS);
      expect(returnedIds).toEqual(expectedOrder(seeded).map((event) => event.eventId));
    },
    PAGING_TIMEOUT_MS,
  );

  it('returns each event with the stored fields, answeredAt as an ISO string, and the stored isCorrect', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    const seeded = buildSeedEvents(30, now().getTime() - DAY_MS);
    await seedEvents(userId, seeded);

    const response = await fetchPage(app, authorization);

    expect(response.status).toBe(HTTP_OK);
    const body = response.body as PageBody;
    expect(body.data.nextCursor).toBeNull();
    for (const event of body.data.events) {
      expect(typeof event.answeredAt).toBe('string');
      expect(event.answeredAt).toMatch(ISO_DATE_TIME);
    }
    expect(body.data.events.map(fromResponse)).toEqual(expectedOrder(seeded).map(toWire));
    expect(body.data.events.some((event) => event.isCorrect)).toBe(true);
    expect(body.data.events.some((event) => !event.isCorrect)).toBe(true);
  });

  it(
    "never returns another user's events, even when given a cursor from that user's page",
    async () => {
      const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
      const caller = await signIn(now());
      const other = await signIn(now());
      const baseMs = now().getTime() - DAY_MS;
      // The other user's received_at values sit half a second after the caller's, so the two
      // logs interleave and the other user's cursor lands in the middle of the caller's log.
      const callerEvents = buildSeedEvents(600, baseMs);
      const otherEvents = buildSeedEvents(700, baseMs, SECOND_MS / 2);
      await seedEvents(caller.userId, callerEvents);
      await seedEvents(other.userId, otherEvents);
      const callerIds = new Set(callerEvents.map((event) => event.eventId));

      const otherFirst = await fetchPage(app, other.authorization);
      expect(otherFirst.status).toBe(HTTP_OK);
      const otherCursor = (otherFirst.body as PageBody).data.nextCursor;
      expect(typeof otherCursor).toBe('string');

      const callerFirst = await fetchPage(app, caller.authorization);
      const withOtherCursor = await fetchPage(app, caller.authorization, otherCursor as string);

      expect(callerFirst.status).toBe(HTTP_OK);
      const callerFirstEvents = (callerFirst.body as PageBody).data.events;
      expect(callerFirstEvents).toHaveLength(PAGE_SIZE);
      expect(callerFirstEvents.every((event) => callerIds.has(event.eventId))).toBe(true);

      expect(withOtherCursor.status).toBe(HTTP_OK);
      const borrowedEvents = (withOtherCursor.body as PageBody).data.events;
      expect(borrowedEvents.length).toBeGreaterThan(0);
      expect(borrowedEvents.every((event) => callerIds.has(event.eventId))).toBe(true);
    },
    PAGING_TIMEOUT_MS,
  );

  it.each([
    ['an SQL injection string', "' OR 1=1 --"],
    ['an oversized string', 'A'.repeat(OVERSIZED_LENGTH)],
    ['base64url of a JSON object that is not a cursor', Buffer.from('{"x":1}').toString('base64url')],
    ['base64url of plain text', Buffer.from('hello').toString('base64url')],
  ])('answers after set to %s with 400 INPUT_INVALID_QUERY', async (_label: string, after: string) => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    await seedEvents(userId, buildSeedEvents(5, now().getTime() - DAY_MS));

    const response = await fetchPage(app, authorization, after);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_INVALID_QUERY');
    expect(response.body.data).toBeUndefined();
  });

  it('answers a request with no session with 401 and no events', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { userId } = await signIn(now());
    await seedEvents(userId, buildSeedEvents(5, now().getTime() - DAY_MS));

    const response = await request(app).get(ROUTE);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(response.body.data).toBeUndefined();
  });
});
