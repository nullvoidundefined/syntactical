// B-59.1d guards (pass before the fix): when the purchase payload scrub fails inside the deletion
// transaction (forced by a trigger that raises on UPDATE OF payload ON purchase_events), DELETE
// /v1/me answers 500, nothing changes, and no log line holds the email or the user id. Rows linked
// to the deleted user and unlinked rows that carry the identity keep the unconditional clearing of
// `$email` / `$displayName` / `$phoneNumber`.
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import {
  createLoggedDeleteApp,
  deleteWithCookie,
  linesExposing,
  parsedLines,
  seedAccount,
} from '../integration/deleteMeLogFixture.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const HTTP_NO_CONTENT = 204;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const DELETED = '[deleted]';
const ACCOUNT_DELETED = 'account deleted';
const PRODUCT_ID = 'bank-advanced';
const UPDATED_AT_MS = 1_790_000_000_000;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

async function insertPurchaseEvent(userId: string | null, payload: unknown, now: Date): Promise<string> {
  const providerEventId = `evt-${randomBytes(HEX_BYTES).toString('hex')}`;
  await database.pool.query(
    `INSERT INTO purchase_events (provider, provider_event_id, kind, occurred_at, payload, product_id, user_id)
     VALUES ('revenuecat', $1, 'purchase', $2, $3, $4, $5)`,
    [providerEventId, now, JSON.stringify(payload), PRODUCT_ID, userId],
  );
  return providerEventId;
}

async function rowOf(
  providerEventId: string,
): Promise<{ payload: unknown; payloadText: string; user_id: string | null }> {
  const { rows } = await database.pool.query<{ payload: unknown; payloadText: string; user_id: string | null }>(
    'SELECT payload, payload::text AS "payloadText", user_id FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

function attributesOf(value: string) {
  return {
    $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Pat' },
    $email: { updated_at_ms: UPDATED_AT_MS, value },
    $phoneNumber: { updated_at_ms: UPDATED_AT_MS, value: '+15550100' },
  };
}

const CLEARED_ATTRIBUTES = {
  $displayName: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
  $email: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
  $phoneNumber: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
};

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me purchase scrub guards (B-59.1d)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('answers 500, changes nothing, and logs neither the email nor the user id when the payload update fails', async () => {
    const testApp = createLoggedDeleteApp(database.pool);
    const now = testApp.clock.now();
    const account = await seedAccount(database.pool, now);
    const eventId = await insertPurchaseEvent(
      account.userId,
      { event: { app_user_id: account.userId, contact: account.email, type: 'INITIAL_PURCHASE' } },
      now,
    );
    const before = await rowOf(eventId);
    const triggerFunction = `refuse_payload_update_${randomBytes(HEX_BYTES).toString('hex')}`;
    await database.pool.query(
      `CREATE FUNCTION ${triggerFunction}() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'payload update refused by test'; END
       $$ LANGUAGE plpgsql`,
    );
    await database.pool.query(
      `CREATE TRIGGER ${triggerFunction} BEFORE UPDATE OF payload ON purchase_events
       FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()`,
    );
    try {
      const response = await deleteWithCookie(testApp.app, account.sessionToken);

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      const users = await database.pool.query('SELECT id FROM users WHERE id = $1', [account.userId]);
      expect(users.rows).toHaveLength(1);
      const sessions = await database.pool.query('SELECT id FROM sessions WHERE user_id = $1', [
        account.userId,
      ]);
      expect(sessions.rows).toHaveLength(1);
      const after = await rowOf(eventId);
      expect(after.payloadText).toBe(before.payloadText);
      expect(after.user_id).toBe(account.userId);
      const entries = parsedLines(testApp.lines);
      expect(entries.length).toBeGreaterThan(1);
      expect(entries.filter((entry) => entry.msg === ACCOUNT_DELETED)).toEqual([]);
      expect(linesExposing(testApp.lines, account)).toEqual([]);
    } finally {
      await database.pool.query(`DROP TRIGGER IF EXISTS ${triggerFunction} ON purchase_events`);
      await database.pool.query(`DROP FUNCTION IF EXISTS ${triggerFunction}()`);
    }
  });

  it("clears the PII attributes unconditionally on the deleted user's rows and on unlinked rows carrying the identity", async () => {
    const testApp = createLoggedDeleteApp(database.pool);
    const now = testApp.clock.now();
    const account = await seedAccount(database.pool, now);
    const unrelatedAddress = `someone-${randomBytes(HEX_BYTES).toString('hex')}@example.net`;
    const ownEventId = await insertPurchaseEvent(
      account.userId,
      { event: { subscriber_attributes: attributesOf(unrelatedAddress), type: 'RENEWAL' } },
      now,
    );
    const unlinkedEventId = await insertPurchaseEvent(
      null,
      {
        event: {
          app_user_id: account.userId,
          subscriber_attributes: attributesOf(unrelatedAddress),
          type: 'TRANSFER',
        },
      },
      now,
    );

    const response = await deleteWithCookie(testApp.app, account.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect((await rowOf(ownEventId)).payload).toEqual({
      event: { subscriber_attributes: CLEARED_ATTRIBUTES, type: 'RENEWAL' },
    });
    expect((await rowOf(unlinkedEventId)).payload).toEqual({
      event: { app_user_id: DELETED, subscriber_attributes: CLEARED_ATTRIBUTES, type: 'TRANSFER' },
    });
  });
});
