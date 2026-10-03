// B-3.3 review fix: issuing a code invalidates the email's earlier live codes, but under READ
// COMMITTED two concurrent issues each see no committed live code and both commit one. Issues
// for one normalized email are serialized, so concurrent requests leave exactly one live code.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const HTTP_ACCEPTED = 202;
const SETUP_TIMEOUT_MS = 120_000;
// At most the per-email limit, so every request reaches the issue transaction.
const CONCURRENT_ISSUES = 5;
// Holds each issue transaction open across the send, so the transactions overlap.
const SEND_DELAY_MS = 100;
const EMAIL_BYTES = 6;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

describe.skipIf(SKIP_DATABASE_TESTS)('concurrent code issues for one email', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('leave exactly one live code, the one emailed last', async () => {
    const { app, sentCodes } = createAuthTestApp({
      pool: database.pool,
      async sendSignInCode() {
        await delay(SEND_DELAY_MS);
      },
    });
    const local = randomBytes(EMAIL_BYTES).toString('hex');
    const variants = Array.from({ length: CONCURRENT_ISSUES }, (_unused, index) =>
      index % 2 === 0 ? `learner-${local}@example.com` : ` Learner-${local}@EXAMPLE.com`,
    );

    const responses = await Promise.all(
      variants.map((email, index) =>
        request(app)
          .post(CODES_ROUTE)
          .set('X-Forwarded-For', `192.0.2.${index + 1}`)
          .send({ email }),
      ),
    );

    expect(responses.map(({ status }) => status)).toEqual(variants.map(() => HTTP_ACCEPTED));
    expect(sentCodes).toHaveLength(CONCURRENT_ISSUES);
    const { rows } = await database.pool.query<{ count: string }>(
      'SELECT count(*) FROM one_time_codes WHERE invalidated_at IS NULL AND used_at IS NULL',
    );
    expect(rows.map(({ count }) => Number(count))).toEqual([1]);
  });
});
