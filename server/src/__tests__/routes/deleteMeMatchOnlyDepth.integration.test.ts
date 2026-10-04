// B-59.8: depth cap in match-only mode, through DELETE /v1/me. Another user's purchase row nested 100
// levels deep, with no mention of the deleted user's email or id anywhere, stays byte-identical, and the
// deletion still succeeds (204). The row also holds a literal `%` (a discount note), so the SQL prefilter
// takes it as a candidate and the JS predicate, not the prefilter, is what has to leave it alone.
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
const UPDATED_AT_MS = 1_790_000_000_000;
const DISCOUNT_NOTE = '50% off first month';

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

// Builds `levels` nested arrays, each `[marker, next]`; the innermost is `[marker, leaf]`.
function buildArrayChain(levels: number, leaf: string): unknown[] {
  let node: unknown[] = [`level-${levels}`, leaf];
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = [`level-${level}`, node];
  }
  return node;
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me depth cap in match-only mode (B-59.8)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it("leaves another user's 100-level row with no identity byte-identical and answers 204", async () => {
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
          list: buildArrayChain(DEEP_LEVELS, 'array-leaf'),
          note: DISCOUNT_NOTE,
          product_id: PRODUCT_ID,
          subscriber_attributes: { $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail } },
          tree: buildChain(DEEP_LEVELS, 'object-leaf'),
          type: 'RENEWAL',
        },
      },
      now,
    );
    const otherBefore = await rowOf(otherId);
    expect(otherBefore.payloadText).not.toContain(deletedEmail);
    expect(otherBefore.payloadText).not.toContain(deletedUserId);

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const otherAfter = await rowOf(otherId);
    expect(otherAfter.user_id).toBe(otherUserId);
    expect(otherAfter.payloadText).toBe(otherBefore.payloadText);
    expect(otherAfter.payloadText).not.toContain('[deleted]');
    const { rows: remaining } = await database.pool.query('SELECT 1 FROM users WHERE id = $1', [deletedUserId]);
    expect(remaining).toHaveLength(0);
  });
});
