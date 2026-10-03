// B-59.1f guards, against a real Postgres:
// - DELETE /v1/me scrubs an unlinked purchase row that carries the user id only with its hyphens encoded
//   (`%2D`).
// - A chosen row is scrubbed from its locked version: while a helper transaction holds the carrying row
//   FOR UPDATE and changes it, the deletion waits (observed in pg_stat_activity, no sleeps for ordering),
//   and after the helper commits, the stored row keeps the helper's change with the mention scrubbed
//   (the deletion re-reads the row after locking it instead of writing back the version it first read).
// These pass before B-59.1f and must keep passing after it.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = '/v1/me';
const HTTP_NO_CONTENT = 204;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const BLOCKED_DEADLINE_MS = 10_000;
const POLL_INTERVAL_MS = 20;
const HEX_BYTES = 6;
const DELETED = '[deleted]';
const PRODUCT_ID = 'bank-advanced';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
}

async function insertUser(email: string): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id }] = rows;
  return id;
}

async function insertPurchaseEvent(userId: string | null, payload: unknown, now: Date): Promise<string> {
  const providerEventId = `evt-${randomBytes(HEX_BYTES).toString('hex')}`;
  await database.pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'purchase', $2, $3, $4, $5)`,
    [providerEventId, now, JSON.stringify(payload), PRODUCT_ID, userId],
  );
  return providerEventId;
}

async function payloadOf(providerEventId: string): Promise<unknown> {
  const { rows } = await database.pool.query<{ payload: unknown }>(
    'SELECT payload FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [{ payload }] = rows;
  return payload;
}

async function countWhere(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(sql, params);
  const [{ count }] = rows;
  return Number(count);
}

// Polls until a backend is blocked by the holder, or fails the test at the deadline.
async function waitForBlockedBy(holderPid: number): Promise<void> {
  const deadline = Date.now() + BLOCKED_DEADLINE_MS;
  const sql = 'SELECT count(*) FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))';
  while ((await countWhere(sql, [holderPid])) < 1) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for a backend blocked by the holder');
    }
    await delay(POLL_INTERVAL_MS);
  }
}

async function backendPid(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  const [{ pid }] = rows;
  return pid;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Authorization', `Bearer ${sessionToken}`)
    .then((response) => response);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me narrow row locks guards (B-59.1f)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('scrubs an unlinked row that carries the user id only with its hyphens encoded as %2D', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const userId = await insertUser(uniqueEmail('learner'));
    const caller = await insertSession(database.pool, { createdAt: now, userId });
    const unlinkedId = await insertPurchaseEvent(
      null,
      {
        event: {
          app_user_id: userId.replaceAll('-', '%2D'),
          product_id: PRODUCT_ID,
          type: 'NON_RENEWING_PURCHASE',
        },
      },
      now,
    );

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(await payloadOf(unlinkedId)).toEqual({
      event: { app_user_id: DELETED, product_id: PRODUCT_ID, type: 'NON_RENEWING_PURCHASE' },
    });
  });

  it(
    'scrubs a chosen row from the version a concurrent writer committed while holding its lock',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const now = testApp.clock.now();
      const email = uniqueEmail('learner');
      const userId = await insertUser(email);
      const caller = await insertSession(database.pool, { createdAt: now, userId });
      const carryingId = await insertPurchaseEvent(
        null,
        {
          event: {
            contact: encodeURIComponent(email),
            product_id: PRODUCT_ID,
            type: 'INITIAL_PURCHASE',
          },
        },
        now,
      );

      const holder = await database.pool.connect();
      let isHolderOpen = true;
      let pending: Promise<request.Response> | undefined;
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT provider_event_id FROM purchase_events WHERE provider_event_id = $1 FOR UPDATE', [
          carryingId,
        ]);
        await holder.query(
          `UPDATE purchase_events SET payload = payload || '{"late": "kept"}'::jsonb WHERE provider_event_id = $1`,
          [carryingId],
        );
        const holderPid = await backendPid(holder);

        pending = deleteWithBearer(testApp, caller.sessionToken);
        await waitForBlockedBy(holderPid);
        await holder.query('COMMIT');
        isHolderOpen = false;
        const response = await pending;

        expect(response.status).toBe(HTTP_NO_CONTENT);
        expect(await payloadOf(carryingId)).toEqual({
          event: { contact: DELETED, product_id: PRODUCT_ID, type: 'INITIAL_PURCHASE' },
          late: 'kept',
        });
        expect(await countWhere('SELECT count(*) FROM users WHERE id = $1', [userId])).toBe(0);
      } finally {
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
