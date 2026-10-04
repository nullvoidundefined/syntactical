// B-59.7 guards (pass today, unlocked): a row linked to another user that mentions the deleted
// user's email only glued to other text (`<email>-INITIAL_PURCHASE`, `x<email>`) is matched strictly,
// so DELETE /v1/me answers 204 and leaves that row byte-identical, its own `$email` included.
import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const DELETE_ME_ROUTE = '/v1/me';
const HTTP_NO_CONTENT = 204;
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const PRODUCT_ID = 'bank-advanced';
const UPDATED_AT_MS = 1_790_000_000_000;

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

async function payloadTextOf(providerEventId: string): Promise<string> {
  const { rows } = await database.pool.query<{ payloadText: string }>(
    'SELECT payload::text AS "payloadText" FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [{ payloadText }] = rows;
  return payloadText;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me loose match guards (B-59.7)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it("leaves another user's row that carries the deleted email only glued to other text byte-identical", async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const deletedEmail = uniqueEmail('learner-a');
    const otherEmail = uniqueEmail('learner-b');
    const deletedUserId = await insertUser(deletedEmail);
    const otherUserId = await insertUser(otherEmail);
    const caller = await insertSession(database.pool, { createdAt: now, userId: deletedUserId });
    const otherId = await insertPurchaseEvent(
      otherUserId,
      {
        event: {
          app_user_id: otherUserId,
          product_id: PRODUCT_ID,
          refs: [`${deletedEmail}-INITIAL_PURCHASE`, `x${deletedEmail}`],
          subscriber_attributes: { $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail } },
          type: 'RENEWAL',
          [`x${deletedEmail}`]: 'keyed-by-glued-text',
        },
      },
      now,
    );
    const before = await payloadTextOf(otherId);

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(await payloadTextOf(otherId)).toBe(before);
  });
});
