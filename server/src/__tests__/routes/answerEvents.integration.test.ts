// B-32, B-33 (decision 24): POST /v1/answer-events stores each event once by eventId, so a
// re-uploaded batch changes no totals; the server derives isCorrect from choiceIndex against
// the answer key and ignores the client's claim; an event naming an unknown bank, an unknown
// question, or a choice outside the question's choices rejects the whole batch (422, nothing
// stored); more than 200 events is 413; no session is 401.
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
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNPROCESSABLE = 422;
const SETUP_TIMEOUT_MS = 120_000;
const MINUTE_MS = 60_000;
const ANSWERED_MINUTES_AGO = 3;
const BANK_KEY = 'python/easy';
const OTHER_BANK_KEY = 'python/medium';
const MC_QUESTION_IDS = ['py-easy-001', 'py-easy-002', 'py-easy-003', 'py-easy-004', 'py-easy-005'];
const MC_CHOICE_COUNT = 4;
const MC_ANSWER_INDEX = 2;
const BOOL_TRUE_QUESTION_ID = 'py-easy-bool-true';
const BATCH_SIZE = 50;
const MAX_BATCH = 200;

// mc questions: four choices, answer 2. The bool question's answer is true: True is choice 0.
const answerKey: AnswerKey = new Map([
  [
    BANK_KEY,
    new Map<string, AnswerKeyEntry>([
      ...MC_QUESTION_IDS.map((id) => [id, { answerIndex: MC_ANSWER_INDEX, choiceCount: MC_CHOICE_COUNT }] as const),
      [BOOL_TRUE_QUESTION_ID, { answerIndex: 0, choiceCount: 2 }] as const,
    ]),
  ],
  [OTHER_BANK_KEY, new Map([['py-medium-001', { answerIndex: 1, choiceCount: 3 }]])],
]);

interface WireEvent {
  answeredAt: string;
  bankKey: string;
  choiceIndex: number;
  eventId: string;
  isCorrect?: boolean;
  questionId: string;
  roundKind: 'bank' | 'review' | 'topic';
}

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildEvent(now: Date, overrides: Partial<WireEvent> = {}): WireEvent {
  return {
    answeredAt: new Date(now.getTime() - ANSWERED_MINUTES_AGO * MINUTE_MS).toISOString(),
    bankKey: BANK_KEY,
    choiceIndex: MC_ANSWER_INDEX,
    eventId: randomUUID(),
    questionId: MC_QUESTION_IDS[0],
    roundKind: 'bank',
    ...overrides,
  };
}

// count events, cycling through the mc questions and choices so some are right and some wrong,
// spread a second apart.
function buildBatch(now: Date, count: number): WireEvent[] {
  return Array.from({ length: count }, (_, index) =>
    buildEvent(now, {
      answeredAt: new Date(now.getTime() - ANSWERED_MINUTES_AGO * MINUTE_MS - index * 1000).toISOString(),
      choiceIndex: index % MC_CHOICE_COUNT,
      questionId: MC_QUESTION_IDS[index % MC_QUESTION_IDS.length],
    }),
  );
}

async function signIn(now: Date): Promise<{ authorization: string; userId: string }> {
  const { sessionToken, userId } = await insertSession(database.pool, { createdAt: now });
  return { authorization: `Bearer ${sessionToken}`, userId };
}

async function countEvents(userId: string): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM answer_events WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0].count);
}

async function storedCorrectness(userId: string): Promise<Map<string, boolean>> {
  const { rows } = await database.pool.query<{ event_id: string; is_correct: boolean }>(
    'SELECT event_id, is_correct FROM answer_events WHERE user_id = $1',
    [userId],
  );
  return new Map(rows.map((row) => [row.event_id, row.is_correct]));
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/answer-events', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('stores a batch of 50 once, and a re-posted identical batch inserts nothing and changes no totals', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    const events = buildBatch(now(), BATCH_SIZE);

    const first = await request(app).post(ROUTE).set('Authorization', authorization).send({ events });
    const second = await request(app).post(ROUTE).set('Authorization', authorization).send({ events });

    expect(first.status).toBe(HTTP_OK);
    expect(first.body.data.insertedCount).toBe(BATCH_SIZE);
    expect(first.body.data.xpTotal).toBeGreaterThan(0);
    expect(second.status).toBe(HTTP_OK);
    expect(second.body.data.insertedCount).toBe(0);
    expect(await countEvents(userId)).toBe(BATCH_SIZE);
    const { xpTotal, xpToday, dayStreak, dailyProgress } = first.body.data;
    expect(second.body.data).toEqual({ dailyProgress, dayStreak, insertedCount: 0, xpToday, xpTotal });
  });

  it('derives is_correct from choiceIndex against the answer key, ignoring the client isCorrect', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    const wrongClaimedRight = buildEvent(now(), { choiceIndex: 0, isCorrect: true });
    const rightClaimedWrong = buildEvent(now(), { choiceIndex: MC_ANSWER_INDEX, isCorrect: false });
    const boolTrueChosen = buildEvent(now(), { choiceIndex: 0, questionId: BOOL_TRUE_QUESTION_ID });
    const boolFalseChosen = buildEvent(now(), { choiceIndex: 1, questionId: BOOL_TRUE_QUESTION_ID });

    const response = await request(app)
      .post(ROUTE)
      .set('Authorization', authorization)
      .send({ events: [wrongClaimedRight, rightClaimedWrong, boolTrueChosen, boolFalseChosen] });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data.insertedCount).toBe(4);
    const stored = await storedCorrectness(userId);
    expect(stored.get(wrongClaimedRight.eventId)).toBe(false);
    expect(stored.get(rightClaimedWrong.eventId)).toBe(true);
    expect(stored.get(boolTrueChosen.eventId)).toBe(true);
    expect(stored.get(boolFalseChosen.eventId)).toBe(false);
  });

  it('rejects a batch with a choiceIndex at or beyond choiceCount with 422 naming those events, storing none', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    const atCount = buildEvent(now(), { choiceIndex: MC_CHOICE_COUNT });
    const beyondCount = buildEvent(now(), { choiceIndex: MC_CHOICE_COUNT + 3 });
    const boolBeyond = buildEvent(now(), { choiceIndex: 2, questionId: BOOL_TRUE_QUESTION_ID });
    const events = [...buildBatch(now(), 3), atCount, beyondCount, boolBeyond, buildEvent(now())];

    const response = await request(app).post(ROUTE).set('Authorization', authorization).send({ events });

    expect(response.status).toBe(HTTP_UNPROCESSABLE);
    expect(response.body.error.code).toBe('SYNC_INVALID_EVENTS');
    expect(sorted(response.body.error.eventIds)).toEqual(
      sorted([atCount.eventId, beyondCount.eventId, boolBeyond.eventId]),
    );
    expect(await countEvents(userId)).toBe(0);
  });

  it('rejects a batch naming an unknown bankKey or an unknown questionId with 422 naming those events, storing none', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    const unknownBank = buildEvent(now(), { bankKey: 'cobol/easy' });
    const unknownQuestion = buildEvent(now(), { questionId: 'py-easy-999' });
    const questionFromOtherBank = buildEvent(now(), { choiceIndex: 1, questionId: 'py-medium-001' });
    const events = [buildEvent(now()), unknownBank, unknownQuestion, questionFromOtherBank, ...buildBatch(now(), 2)];

    const response = await request(app).post(ROUTE).set('Authorization', authorization).send({ events });

    expect(response.status).toBe(HTTP_UNPROCESSABLE);
    expect(response.body.error.code).toBe('SYNC_INVALID_EVENTS');
    expect(sorted(response.body.error.eventIds)).toEqual(
      sorted([unknownBank.eventId, unknownQuestion.eventId, questionFromOtherBank.eventId]),
    );
    expect(await countEvents(userId)).toBe(0);
  });

  it('accepts a batch of 200 (above the app-wide 10 KB body limit) and refuses 201 with 413, storing none of them', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { authorization, userId } = await signIn(now());
    const atLimit = buildBatch(now(), MAX_BATCH);
    const overLimit = buildBatch(now(), MAX_BATCH + 1);

    const accepted = await request(app).post(ROUTE).set('Authorization', authorization).send({ events: atLimit });
    const refused = await request(app).post(ROUTE).set('Authorization', authorization).send({ events: overLimit });

    expect(accepted.status).toBe(HTTP_OK);
    expect(accepted.body.data.insertedCount).toBe(MAX_BATCH);
    expect(refused.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
    expect(refused.body.error.code).toBe('INPUT_PAYLOAD_TOO_LARGE');
    expect(await countEvents(userId)).toBe(MAX_BATCH);
    const stored = await storedCorrectness(userId);
    expect(overLimit.some((event) => stored.has(event.eventId))).toBe(false);
  });

  it('answers a post with no session with 401 and stores nothing', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });

    const response = await request(app).post(ROUTE).send({ events: buildBatch(now(), 2) });

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    const { rows } = await database.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM answer_events');
    expect(Number(rows[0].count)).toBe(0);
  });
});
