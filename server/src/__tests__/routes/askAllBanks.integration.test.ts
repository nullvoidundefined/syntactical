// server/src/__tests__/routes/askAllBanks.integration.test.ts
// Area 2: POST /v1/ask finds a Medium or Hard question in the index readServerQuestions builds from
// the one public content directory, and answers it for a user with any granted entitlement. There
// is no paidBanks dependency and no per-bank gate (area 3 replaces the remaining gate with Pro).
// The model is a fake that records each prompt.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SUPPORTED_SCHEMA_VERSION } from '@syntactical/content-schema';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { readServerQuestions } from '../../services/readServerQuestions.js';
import { createFakeModelProvider } from '../../testing/fakeModelProvider.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createTestApp } from '../integration/createTestApp.js';
import { insertSession } from '../integration/insertSession.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const ALLOWED_ORIGIN = 'https://syntactical.dev';
const ANY_PRODUCT = 'syntactical.go.medium';
const MESSAGE = 'Why is this the answer?';
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const PROVENANCE = { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } };

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
let contentDir: string;

function serializeBank(difficulty: string): Buffer {
  const question = {
    answerIndex: 0,
    choices: [{ text: 'yes' }, { text: 'no' }],
    id: `fixture-${difficulty}-0`,
    prompt: 'Is this so?',
    provenance: PROVENANCE,
    query: { explanation: `${difficulty}-explanation-marker`, title: 'A rule' },
    type: 'mc',
  };
  return Buffer.from(JSON.stringify({ questions: [question], schemaVersion: SUPPORTED_SCHEMA_VERSION }), 'utf8');
}

async function writeUnder(relativePath: string, bytes: Buffer | string): Promise<void> {
  const file = join(contentDir, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function writePublicContent(): Promise<void> {
  const banks: Record<string, unknown> = {};
  for (const difficulty of DIFFICULTIES) {
    const bytes = serializeBank(difficulty);
    const path = `python/${difficulty}.json`;
    await writeUnder(path, bytes);
    banks[difficulty] = {
      contentVersion: 1,
      hash: createHash('sha256').update(bytes).digest('hex'),
      path,
      topicCounts: {},
    };
  }
  const language = {
    banks,
    glyph: 'PY',
    grammar: 'python',
    id: 'python',
    label: 'Python',
    misconceptions: [],
    tagline: 'Tagline.',
    topics: [],
  };
  await writeUnder('manifest.json', JSON.stringify({ languages: [language], schemaVersion: SUPPORTED_SCHEMA_VERSION }));
}

async function signInEntitled() {
  const model = createFakeModelProvider();
  const questions = await readServerQuestions(contentDir);
  const { app, clock } = createTestApp({ ask: { modelProvider: model, questions }, pool: database.pool });
  const { sessionToken, userId } = await insertSession(database.pool, { createdAt: clock.now() });
  await database.pool.query('INSERT INTO entitlements (user_id, product_id, status, source) VALUES ($1, $2, $3, $4)', [
    userId,
    ANY_PRODUCT,
    'granted',
    'test',
  ]);
  return { app, model, sessionToken };
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/ask on every bank of the public content tree', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database.drop();
  });

  beforeEach(async () => {
    await database.reset();
    contentDir = await mkdtemp(join(tmpdir(), 'ask-all-banks-'));
    await writePublicContent();
  });

  afterEach(async () => {
    await rm(contentDir, { force: true, recursive: true });
  });

  it('indexes the Easy, Medium, and Hard banks from the one content directory', async () => {
    const questions = await readServerQuestions(contentDir);

    expect([...questions.keys()].sort()).toEqual(['python/easy', 'python/hard', 'python/medium']);
  });

  it.each(['medium', 'hard'])('answers a %s question for a user with any granted entitlement', async (difficulty) => {
    const { app, model, sessionToken } = await signInEntitled();

    const response = await request(app)
      .post('/v1/ask')
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Origin', ALLOWED_ORIGIN)
      .send({ bankKey: `python/${difficulty}`, message: MESSAGE, questionId: `fixture-${difficulty}-0` });

    expect(response.status).toBe(200);
    expect(model.prompts[0]?.user).toContain(`${difficulty}-explanation-marker`);
  });
});
