// B-36b (B-36): GET /v1/answer-events?after=<cursor> answers a well-shaped cursor whose
// timestamp JavaScript accepts but Postgres cannot store with 400 INPUT_INVALID_QUERY, never a
// 500. Year 0000 is a real instant to JavaScript's Date (it round-trips through toISOString),
// but Postgres has no year zero, so the cursor's ::timestamptz cast fails.
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { AnswerKey } from '../../types/AnswerKey.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createSyncTestApp } from '../integration/createSyncTestApp.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const ROUTE = '/v1/answer-events';
const HTTP_BAD_REQUEST = 400;
const SETUP_TIMEOUT_MS = 120_000;
// Matches the cursor's timestamp pattern and survives a JavaScript Date round trip.
const YEAR_ZERO_RECEIVED_AT = '0000-01-01T00:00:00.000000Z';

// The download route never consults the answer key; an empty one is enough to build the app.
const answerKey: AnswerKey = new Map();

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function encodeCursor(cursor: { e: string; r: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

describe.skipIf(SKIP_DATABASE_TESTS)('GET /v1/answer-events cursor outside the range Postgres stores', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers a cursor dated year 0000 with 400 INPUT_INVALID_QUERY, not 500', async () => {
    const { app, now } = createSyncTestApp({ answerKey, pool: database.pool });
    const { sessionToken } = await insertSession(database.pool, { createdAt: now() });
    const after = encodeCursor({ e: randomUUID(), r: YEAR_ZERO_RECEIVED_AT });

    const response = await request(app).get(ROUTE).query({ after }).set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe('INPUT_INVALID_QUERY');
    expect(response.body.data).toBeUndefined();
  });
});
