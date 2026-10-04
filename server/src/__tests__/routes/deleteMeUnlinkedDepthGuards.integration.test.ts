// B-59.8 guard (unlinked): an unlinked purchase row nested past the 64-level cap fails closed. It is
// chosen even though its only mention of the deleted user's email sits below the cap, where the
// match-only walk no longer looks, and it is scrubbed in the default mode: the deep subtree becomes
// `[deleted]`, so the email is gone from the stored text.
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
const DEEP_LEVELS = 100;
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

interface StoredRow {
  payloadText: string;
  user_id: string | null;
}

// The stored row's payload as text, byte for byte.
async function rowOf(providerEventId: string): Promise<StoredRow> {
  const { rows } = await database.pool.query<StoredRow>(
    'SELECT payload::text AS "payloadText", user_id FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

// Builds `levels` nested objects, each `{ marker, child }`; the innermost holds `note: leaf`. The root
// object is level 1.
function buildChain(levels: number, leaf: string): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: `level-${levels}`, note: leaf };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { marker: `level-${level}`, child: node };
  }
  return node;
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me unlinked rows past the depth cap (B-59.8 guard)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('scrubs an unlinked row whose only mention of the email is nested below the cap', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const deletedEmail = uniqueEmail('learner-a');
    const deletedUserId = await insertUser(deletedEmail);
    const caller = await insertSession(database.pool, { createdAt: now, userId: deletedUserId });
    const unlinkedId = await insertPurchaseEvent(
      null,
      { event: { product_id: PRODUCT_ID, tree: buildChain(DEEP_LEVELS, `contact ${deletedEmail}`), type: 'TRANSFER' } },
      now,
    );
    expect((await rowOf(unlinkedId)).payloadText).toContain(deletedEmail);

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const after = await rowOf(unlinkedId);
    expect(after.user_id).toBeNull();
    expect(after.payloadText.toLowerCase()).not.toContain(deletedEmail);
    expect(after.payloadText).toContain('[deleted]');
    expect(after.payloadText).toContain(PRODUCT_ID);
  });
});
