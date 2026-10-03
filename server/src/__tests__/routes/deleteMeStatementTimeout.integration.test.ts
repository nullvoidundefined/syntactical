// B-59.5: the deletion transaction sets a statement_timeout as well as a lock_timeout. A short
// statement timeout is injected through the optional `deletionStatementTimeoutMs` auth dep (the
// production default stays 15 seconds). While another transaction holds the email's advisory lock,
// DELETE /v1/me answers 500 once the injected statement timeout fires, well before the 5 second
// lock_timeout could, and changes nothing; once the holder commits, a retry succeeds with 204.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = '/v1/me';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const HTTP_NO_CONTENT = 204;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const HEX_BYTES = 6;
const INJECTED_STATEMENT_TIMEOUT_MS = 1_000;
// Below the 5 second lock_timeout: only the injected statement_timeout can end the wait this soon.
const RESPONSE_BOUND_MS = 4_000;
const NO_RESPONSE = 'no response within the bound';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

function deleteWithCookie({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest')
    .then((response) => response);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me statement timeout', () => {
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
    'answers 500 once the injected statement timeout fires and changes nothing, then a retry gets 204',
    async () => {
      const testApp = createAuthTestApp({
        deletionStatementTimeoutMs: INJECTED_STATEMENT_TIMEOUT_MS,
        pool: database.pool,
      });
      const email = `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
      const { rows } = await database.pool.query<{ id: string }>(
        'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
        [email, 'Europe/London'],
      );
      const [{ id: userId }] = rows;
      const { sessionToken } = await insertSession(database.pool, { createdAt: testApp.clock.now(), userId });

      const holder = await database.pool.connect();
      let isHolderOpen = true;
      let pending: Promise<request.Response> | undefined;
      const boundTimer = new AbortController();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);

        const startedAt = Date.now();
        pending = deleteWithCookie(testApp, sessionToken);
        const outcome = await Promise.race([
          pending,
          delay(RESPONSE_BOUND_MS, NO_RESPONSE, { signal: boundTimer.signal }).catch(() => NO_RESPONSE),
        ]);
        const elapsedMs = Date.now() - startedAt;

        expect(typeof outcome === 'string' ? outcome : outcome.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
        expect(elapsedMs).toBeGreaterThanOrEqual(INJECTED_STATEMENT_TIMEOUT_MS);
        expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(1);
        expect(await countWhere('SELECT count(*) FROM sessions WHERE user_id = $1', [userId])).toBe(1);

        await holder.query('COMMIT');
        isHolderOpen = false;
        const retried = await deleteWithCookie(testApp, sessionToken);

        expect(retried.status).toBe(HTTP_NO_CONTENT);
        expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
      } finally {
        boundTimer.abort();
        if (isHolderOpen) {
          await holder.query('COMMIT').catch(() => undefined);
        }
        holder.release();
        await pending?.catch(() => undefined);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
