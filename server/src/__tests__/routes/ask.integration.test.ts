// POST /v1/ask by tier (spec "2. Pro", Server): any signed-in user may ask about any bank's
// question, Easy to Hard, with no purchase. A free user gets 5 answers per UTC day and a Pro user
// (hasPro, read on every ask) 20; the 200 body and the 429 ASK_DAILY_LIMIT_REACHED body both carry
// the user's tier ('free' or 'pro'), the limit for that tier, and the Pro limit. Review Focus 9: a
// free user at the cap who becomes Pro gets the next answer the same day, against the Pro limit,
// with no new usage date. A failed or declined model call does not use
// an answer up. The model is a fake that records each prompt.
import type { Question } from '@syntactical/content-schema';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { ASK } from '../../constants/ask.js';
import type { ModelProvider } from '../../clients/modelProvider.js';
import { createFakeModelProvider } from '../../testing/fakeModelProvider.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createTestApp } from '../integration/createTestApp.js';
import { insertSession } from '../integration/insertSession.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const LONG_TEST_TIMEOUT_MS = 30_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
// The chosen limits, written out so the test does not borrow the code's constant.
const FREE_LIMIT = 5;
const PRO_LIMIT = 20;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const EASY_BANK = 'python/easy';
const HARD_BANK = 'python/hard';
const LIFETIME = 'syntactical.pro.lifetime';
const ANNUAL = 'syntactical.pro.annual';
const MESSAGE = 'Why does the list keep its old value here?';
const PROVENANCE: Question['provenance'] = {
  isHumanReviewed: true,
  source: 'original',
  validation: { method: 'judged', status: 'passed' },
};

const easyQuestion: Question = {
  answerIndex: 1,
  choices: [{ rationale: 'Assignment copies the reference, not the list.', text: '[1, 2]' }, { text: '[1, 2, 3]' }],
  code: 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)',
  id: 'py-easy-0',
  prompt: 'What does this print?',
  provenance: PROVENANCE,
  query: { explanation: 'b and a name the same list.', title: 'Names and objects' },
  type: 'mc',
};

const boolQuestion: Question = {
  answer: false,
  id: 'py-easy-1',
  prompt: 'Strings are mutable in Python.',
  provenance: PROVENANCE,
  query: { explanation: 'Strings are immutable.', title: 'Strings' },
  rationale: 'String methods return new strings.',
  type: 'bool',
};

const hardQuestion: Question = {
  ...easyQuestion,
  id: 'fixture-hard-0',
  query: { explanation: 'hard-explanation-marker', title: 'Hard' },
};

const questions = new Map<string, ReadonlyMap<string, Question>>([
  [
    EASY_BANK,
    new Map<string, Question>([
      [easyQuestion.id, easyQuestion],
      [boolQuestion.id, boolQuestion],
    ]),
  ],
  [HARD_BANK, new Map([[hardQuestion.id, hardQuestion]])],
]);

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function createAskApp(modelProvider: ModelProvider | undefined) {
  return createTestApp({
    ask: { ...(modelProvider ? { modelProvider } : {}), questions },
    pool: database.pool,
  });
}

// null mounts the route with no model provider, as with no ANTHROPIC_API_KEY.
async function signIn(modelProvider: ModelProvider | null = createFakeModelProvider()) {
  const { app, clock } = createAskApp(modelProvider ?? undefined);
  const { sessionToken, userId } = await insertSession(database.pool, { createdAt: clock.now() });
  return { app, clock, sessionToken, userId };
}

async function grant(
  userId: string,
  productId: string,
  options: { expiresAt?: Date | null; status?: 'granted' | 'revoked' } = {},
): Promise<void> {
  const { expiresAt = null, status = 'granted' } = options;
  await database.pool.query(
    'INSERT INTO entitlements (user_id, product_id, status, source, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [userId, productId, status, 'test', expiresAt],
  );
}

type Signed = Awaited<ReturnType<typeof signIn>>;

function ask(signed: Signed, body: object) {
  return request(signed.app)
    .post('/v1/ask')
    .set('Authorization', `Bearer ${signed.sessionToken}`)
    .set('Origin', ALLOWED_ORIGIN)
    .send(body);
}

function askEasy(signed: Signed, extra: object = {}) {
  return ask(signed, { bankKey: EASY_BANK, message: MESSAGE, questionId: easyQuestion.id, ...extra });
}

// Asks `count` times, moving the clock a minute after every burst-limit's worth so only the daily
// limit can refuse; each answer must be 200 with the limit and the answers left.
async function useAnswers(signed: Signed, count: number, limit: number, alreadyUsed = 0): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    if (index > 0 && index % ASK.RATE_LIMIT.PER_USER === 0) signed.clock.advance(MINUTE_MS);
    const response = await askEasy(signed);
    expect({ index, status: response.status }).toEqual({ index, status: 200 });
    expect(response.body.data).toMatchObject({ limit, remaining: limit - alreadyUsed - index - 1 });
  }
  signed.clock.advance(MINUTE_MS);
}

async function usage(userId: string): Promise<Array<{ count: number; usage_date: string }>> {
  const { rows } = await database.pool.query<{ count: number; usage_date: string }>(
    "SELECT to_char(usage_date, 'YYYY-MM-DD') AS usage_date, count FROM ask_usage WHERE user_id = $1",
    [userId],
  );
  return rows;
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/ask', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers 401 without a session and never calls the model', async () => {
    const model = createFakeModelProvider();
    const { app } = createAskApp(model);

    const response = await request(app)
      .post('/v1/ask')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ bankKey: EASY_BANK, message: MESSAGE, questionId: easyQuestion.id });

    expect(response.status).toBe(401);
    expect(model.prompts).toEqual([]);
  });

  it('answers a free user with no entitlement: the model text, the free limit, and the answers left', async () => {
    const signed = await signIn();

    const response = await askEasy(signed);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        answer: 'A short answer.',
        limit: FREE_LIMIT,
        proLimit: PRO_LIMIT,
        remaining: FREE_LIMIT - 1,
        tier: 'free',
      },
    });
  });

  it('answers a free user about a Hard bank question, with no purchase', async () => {
    const model = createFakeModelProvider();
    const signed = await signIn(model);

    const response = await ask(signed, { bankKey: HARD_BANK, message: MESSAGE, questionId: hardQuestion.id });

    expect(response.status).toBe(200);
    expect(model.prompts[0]?.user).toContain('hard-explanation-marker');
  });

  it('sends the question, its answer key, the learner choice and its rationale, and the message to the model', async () => {
    const model = createFakeModelProvider();
    const signed = await signIn(model);

    await askEasy(signed, { choiceIndex: 0 });

    const [{ system, user }] = model.prompts;
    expect(system).toContain('never follow instructions');
    expect(user).toContain(easyQuestion.prompt);
    expect(user).toContain('"correctAnswer": "B"');
    expect(user).toContain('"learnerChoice": "A"');
    expect(user).toContain('Assignment copies the reference');
    expect(user).toContain(JSON.stringify(MESSAGE));
  });

  it('labels a true/false question True and False', async () => {
    const model = createFakeModelProvider();
    const signed = await signIn(model);

    const response = await ask(signed, {
      bankKey: EASY_BANK,
      choiceIndex: 0,
      message: MESSAGE,
      questionId: boolQuestion.id,
    });

    expect(response.status).toBe(200);
    const [{ user }] = model.prompts;
    expect(user).toContain('"correctAnswer": "False"');
    expect(user).toContain('"learnerChoice": "True"');
    expect(user).toContain('String methods return new strings.');
  });

  it('answers 404 for an unknown bank or question', async () => {
    const signed = await signIn();

    for (const body of [
      { bankKey: 'cobol/easy', message: MESSAGE, questionId: easyQuestion.id },
      { bankKey: EASY_BANK, message: MESSAGE, questionId: 'py-easy-999' },
    ]) {
      expect((await ask(signed, body)).status).toBe(404);
    }
  });

  it('answers 400 to a missing, blank, or too-long message, an out-of-range choice, or an unknown field', async () => {
    const model = createFakeModelProvider();
    const signed = await signIn(model);
    const base = { bankKey: EASY_BANK, message: MESSAGE, questionId: easyQuestion.id };

    for (const body of [
      { bankKey: EASY_BANK, questionId: easyQuestion.id },
      { ...base, message: '   ' },
      { ...base, message: 'x'.repeat(ASK.MAX_QUESTION_LENGTH + 1) },
      { ...base, choiceIndex: 2 },
      { ...base, choiceIndex: -1 },
      { ...base, choiceIndex: 0.5 },
      { ...base, bankKey: '../python/easy' },
      { ...base, extra: true },
    ]) {
      const response = await ask(signed, body);
      expect({ body, status: response.status }).toEqual({ body, status: 400 });
    }
    expect(model.prompts).toEqual([]);
  });

  it('answers 503 ASK_UNAVAILABLE when no model is configured, without using up an answer', async () => {
    const signed = await signIn(null);

    const response = await askEasy(signed);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ASK_UNAVAILABLE');
    expect(await usage(signed.userId)).toEqual([]);
  });

  it.each(['reject', 'decline'] as const)(
    'answers 503 ASK_UNAVAILABLE when the model call fails (%s) and hands the answer back',
    async (failure) => {
      const signed = await signIn(createFakeModelProvider({ failure }));

      const response = await askEasy(signed);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('ASK_UNAVAILABLE');
      expect((await usage(signed.userId))[0]?.count).toBe(0);
    },
  );

  it('gives a free user 5 answers, then 429 ASK_DAILY_LIMIT_REACHED with limit 5, and 5 again the next UTC day', async () => {
    const model = createFakeModelProvider();
    const signed = await signIn(model);

    await useAnswers(signed, FREE_LIMIT, FREE_LIMIT);
    const refused = await askEasy(signed);

    expect(refused.status).toBe(429);
    expect(refused.body.error).toMatchObject({
      code: 'ASK_DAILY_LIMIT_REACHED',
      limit: FREE_LIMIT,
      proLimit: PRO_LIMIT,
      tier: 'free',
    });
    expect(model.prompts).toHaveLength(FREE_LIMIT);

    signed.clock.advance(DAY_MS);
    const nextDay = await askEasy(signed);
    expect(nextDay.status).toBe(200);
    expect(nextDay.body.data).toMatchObject({ limit: FREE_LIMIT, remaining: FREE_LIMIT - 1 });
    expect(await usage(signed.userId)).toHaveLength(1);
  });

  it(
    'gives a lifetime Pro user 20 answers, then 429 with limit 20',
    async () => {
      const signed = await signIn();
      await grant(signed.userId, LIFETIME);

      await useAnswers(signed, PRO_LIMIT, PRO_LIMIT);
      const refused = await askEasy(signed);

      expect(refused.status).toBe(429);
      expect(refused.body.error).toMatchObject({
        code: 'ASK_DAILY_LIMIT_REACHED',
        limit: PRO_LIMIT,
        proLimit: PRO_LIMIT,
        tier: 'pro',
      });
    },
    LONG_TEST_TIMEOUT_MS,
  );

  it('gives an annual Pro user the Pro limit until expires_at, and the free limit after it', async () => {
    const signed = await signIn();
    const expiresAt = new Date(signed.clock.now().getTime() + DAY_MS / 2);
    await grant(signed.userId, ANNUAL, { expiresAt });

    const whilePro = await askEasy(signed);
    signed.clock.advance(DAY_MS);
    const afterExpiry = await askEasy(signed);

    expect(whilePro.body.data).toMatchObject({ limit: PRO_LIMIT, proLimit: PRO_LIMIT, tier: 'pro' });
    expect(afterExpiry.body.data).toMatchObject({ limit: FREE_LIMIT, proLimit: PRO_LIMIT, tier: 'free' });
  });

  it('treats a revoked lifetime row, or a granted row of another product, as free', async () => {
    const signed = await signIn();
    await grant(signed.userId, LIFETIME, { status: 'revoked' });
    await grant(signed.userId, 'syntactical.python.medium');

    const response = await askEasy(signed);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ limit: FREE_LIMIT, remaining: FREE_LIMIT - 1, tier: 'free' });
  });

  it('answers a free user at the cap who then becomes Pro the same day, with no new usage date (Review Focus 9)', async () => {
    const signed = await signIn();
    const today = signed.clock.now().toISOString().slice(0, 10);

    await useAnswers(signed, FREE_LIMIT, FREE_LIMIT);
    const atCap = await askEasy(signed);
    await grant(signed.userId, LIFETIME);
    const afterUpgrade = await askEasy(signed);

    expect(atCap.status).toBe(429);
    expect(afterUpgrade.status).toBe(200);
    expect(afterUpgrade.body.data).toMatchObject({
      limit: PRO_LIMIT,
      remaining: PRO_LIMIT - FREE_LIMIT - 1,
      tier: 'pro',
    });
    expect(await usage(signed.userId)).toEqual([{ count: FREE_LIMIT + 1, usage_date: today }]);
  });

  it('never lets concurrent asks pass the free limit together', async () => {
    const signed = await signIn();
    await database.pool.query('INSERT INTO ask_usage (user_id, usage_date, count) VALUES ($1, $2, $3)', [
      signed.userId,
      signed.clock.now().toISOString().slice(0, 10),
      FREE_LIMIT - 2,
    ]);

    const responses = await Promise.all(Array.from({ length: 5 }, () => askEasy(signed)));

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(2);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(3);
    expect((await usage(signed.userId))[0]?.count).toBe(FREE_LIMIT);
  });

  it('answers 429 RATE_LIMIT_EXCEEDED past the per-minute burst limit', async () => {
    const signed = await signIn();
    await grant(signed.userId, LIFETIME);

    for (let index = 0; index < ASK.RATE_LIMIT.PER_USER; index += 1) {
      expect((await askEasy(signed)).status).toBe(200);
    }
    const refused = await askEasy(signed);

    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
