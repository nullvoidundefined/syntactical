// B-59.1f: deleteUser reads candidate purchase_events rows WITHOUT a row lock (the superset prefilter),
// filters them with the JS predicate, and row-locks only the chosen rows. A row that holds a `%` but does
// not carry the deleted identity is never row-locked: while a helper transaction holds SELECT ... FOR UPDATE
// on such an unrelated, unlinked row (with its own `$email` attribute), DELETE /v1/me for a different user
// answers 204 well before the 5 second lock timeout, still scrubs the row that does carry the identity, and
// the unrelated row stays byte-identical after the helper commits. No sleeps order the test: the helper
// holds its lock on a second pooled client before the request starts; the only timer is the response bound.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

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
// The production lock_timeout is 5 seconds; a deletion that never touches the held row answers far sooner.
const RESPONSE_BOUND_MS = 3_000;
const HEX_BYTES = 6;
const DELETED = '[deleted]';
const PRODUCT_ID = 'bank-advanced';
const UPDATED_AT_MS = 1_790_000_000_000;
const NO_RESPONSE = 'no response within the bound';

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

interface StoredText {
  payload: unknown;
  payload_text: string;
  user_id: string | null;
}

async function rowOf(providerEventId: string): Promise<StoredText> {
  const { rows } = await database.pool.query<StoredText>(
    'SELECT payload, payload::text AS payload_text, user_id FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

async function countUsers(userId: string): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>('SELECT count(*) FROM users WHERE id = $1', [userId]);
  const [{ count }] = rows;
  return Number(count);
}

function deleteWithBearer({ app }: TestApp, sessionToken: string): Promise<request.Response> {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Authorization', `Bearer ${sessionToken}`)
    .then((response) => response);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me row-locks only the purchase rows it scrubs (B-59.1f)', () => {
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
    'answers 204 without waiting on a held lock over an unrelated %-bearing row, which stays byte-identical',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const now = testApp.clock.now();
      const deletedEmail = uniqueEmail('learner-a');
      const strangerEmail = uniqueEmail('stranger');
      const deletedUserId = await insertUser(deletedEmail);
      const caller = await insertSession(database.pool, { createdAt: now, userId: deletedUserId });

      const unrelatedId = await insertPurchaseEvent(
        null,
        {
          event: {
            note: `https://shop.example/r?ref%3Dspring%26email%3D${encodeURIComponent(strangerEmail)}`,
            product_id: PRODUCT_ID,
            subscriber_attributes: {
              $email: { updated_at_ms: UPDATED_AT_MS, value: strangerEmail },
            },
            type: 'NON_RENEWING_PURCHASE',
          },
        },
        now,
      );
      const carryingId = await insertPurchaseEvent(
        null,
        {
          event: {
            contact: encodeURIComponent(deletedEmail),
            product_id: PRODUCT_ID,
            type: 'INITIAL_PURCHASE',
          },
        },
        now,
      );
      const unrelatedBefore = await rowOf(unrelatedId);

      const holder = await database.pool.connect();
      let isHolderOpen = true;
      let pending: Promise<request.Response> | undefined;
      const boundTimer = new AbortController();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT provider_event_id FROM purchase_events WHERE provider_event_id = $1 FOR UPDATE', [
          unrelatedId,
        ]);

        const startedAt = Date.now();
        pending = deleteWithBearer(testApp, caller.sessionToken);
        const outcome = await Promise.race([
          pending,
          delay(RESPONSE_BOUND_MS, NO_RESPONSE, { signal: boundTimer.signal }).catch(() => NO_RESPONSE),
        ]);
        const elapsedMs = Date.now() - startedAt;

        expect(typeof outcome === 'string' ? outcome : outcome.status).toBe(HTTP_NO_CONTENT);
        expect(elapsedMs).toBeLessThan(RESPONSE_BOUND_MS);
        expect(await countUsers(deletedUserId)).toBe(0);
        expect((await rowOf(carryingId)).payload).toEqual({
          event: { contact: DELETED, product_id: PRODUCT_ID, type: 'INITIAL_PURCHASE' },
        });

        await holder.query('COMMIT');
        isHolderOpen = false;

        const unrelatedAfter = await rowOf(unrelatedId);
        expect(unrelatedAfter.payload_text).toBe(unrelatedBefore.payload_text);
        expect(unrelatedAfter.user_id).toBeNull();
      } finally {
        boundTimer.abort();
        if (isHolderOpen) {
          await holder.query('COMMIT').catch(() => undefined);
        }
        holder.release();
        // A deletion still waiting on the row lock finishes once the holder commits; let it end here.
        await pending?.catch(() => undefined);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
