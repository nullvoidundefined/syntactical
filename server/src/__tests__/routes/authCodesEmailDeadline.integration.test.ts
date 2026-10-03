// B-3.3 review fix: the sign-in email is sent inside the issue transaction, so a send with no
// deadline would hold a pooled client and the code rows' locks for as long as Resend stalls.
// With a deadline the stalled send aborts, the request answers 503, the transaction rolls back
// leaving no live code, and the pool's only client is free for the next request.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createEmailClient } from '../../clients/emailClient.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const READY_ROUTE = '/health/ready';
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const SEND_TIMEOUT_MS = 100;
const RESPONSE_DEADLINE_MS = 1_500;
const TEST_TIMEOUT_MS = 15_000;
const EMAIL_BYTES = 6;
const SENDER = 'Syntactical <sign-in@syntactical.dev>';
const DEADLINE_PASSED = 'deadline passed';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

// A Resend stand-in whose sends never settle on their own and ignore any abort signal, so only
// the client's own deadline can end them. release() settles every pending send for cleanup.
function createStalledSender() {
  const pending: (() => void)[] = [];
  return {
    release(): void {
      for (const settle of pending.splice(0)) {
        settle();
      }
    },
    resend: {
      emails: {
        send(): Promise<{ data: { id: string }; error: null }> {
          return new Promise((resolve) => {
            pending.push(() => resolve({ data: { id: 'late' }, error: null }));
          });
        },
      },
    },
  };
}

async function within<T>(pending: PromiseLike<T>, milliseconds: number): Promise<T | typeof DEADLINE_PASSED> {
  const passed = delay(milliseconds).then((): typeof DEADLINE_PASSED => DEADLINE_PASSED);
  return Promise.race([Promise.resolve(pending), passed]);
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/codes with a stalled email send', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers 503 within the deadline, keeps no live code, and frees the pooled client', async () => {
    const singleClientPool = new pg.Pool({ connectionString: database.databaseUrl, max: 1 });
    const stalled = createStalledSender();
    const emailClient = createEmailClient({
      from: SENDER,
      logger: pino({ level: 'silent' }),
      resend: stalled.resend,
      sendTimeoutMs: SEND_TIMEOUT_MS,
    });
    const { app } = createAuthTestApp({
      pool: singleClientPool,
      sendSignInCode: (email, code) => emailClient.sendSignInCode(email, code),
    });
    try {
      const issued = await within(request(app).post(CODES_ROUTE).send({ email: buildEmail() }), RESPONSE_DEADLINE_MS);
      const ready = await within(request(app).get(READY_ROUTE), RESPONSE_DEADLINE_MS);

      expect(issued).not.toBe(DEADLINE_PASSED);
      expect((issued as request.Response).status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(ready).not.toBe(DEADLINE_PASSED);
      expect((ready as request.Response).status).toBe(HTTP_OK);
      const { rows } = await database.pool.query<{ count: string }>(
        'SELECT count(*) FROM one_time_codes WHERE used_at IS NULL AND invalidated_at IS NULL',
      );
      expect(rows.map(({ count }) => Number(count))).toEqual([0]);
    } finally {
      stalled.release();
      await singleClientPool.end();
    }
  }, TEST_TIMEOUT_MS);
});
