// B-59.10 guards: widening the SQL prefilter to rows holding a fullwidth `％` adds no false positive. An
// unlinked row holding a fullwidth percent sign but no identity, and another user's row carrying a
// fullwidth-encoded address that is not the deleted email as a whole address (`x<local>％４０<domain>`),
// stay byte-identical after DELETE /v1/me. These pass before B-59.10 and must keep passing after it.
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
  const { rows } = await database.pool.query<{ text: string }>(
    'SELECT payload::text AS text FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [{ text }] = rows;
  return text;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me fullwidth percent escapes guards (B-59.10)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it("leaves a fullwidth-percent row with no identity and another user's glued fullwidth mention byte-identical", async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const deletedEmail = uniqueEmail('learner-a');
    const otherEmail = uniqueEmail('learner-b');
    const deletedUserId = await insertUser(deletedEmail);
    const otherUserId = await insertUser(otherEmail);
    const caller = await insertSession(database.pool, {
      createdAt: now,
      userId: deletedUserId,
    });
    const unrelatedId = await insertPurchaseEvent(
      null,
      {
        event: {
          note: '５０％ off',
          code: 'discount％ＺＺ',
          product_id: PRODUCT_ID,
          type: 'NON_RENEWING_PURCHASE',
        },
      },
      now,
    );
    const otherId = await insertPurchaseEvent(
      otherUserId,
      {
        event: {
          app_user_id: otherUserId,
          gifted_to: `x${deletedEmail.replace('@', '％４０')}`,
          product_id: PRODUCT_ID,
          subscriber_attributes: {
            $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail },
          },
          type: 'RENEWAL',
        },
      },
      now,
    );
    const unrelatedBefore = await payloadTextOf(unrelatedId);
    const otherBefore = await payloadTextOf(otherId);

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(await payloadTextOf(unrelatedId)).toBe(unrelatedBefore);
    expect(await payloadTextOf(otherId)).toBe(otherBefore);
  });
});
