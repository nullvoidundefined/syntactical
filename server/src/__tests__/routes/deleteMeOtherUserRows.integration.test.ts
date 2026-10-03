// B-59.1d: a purchase row linked to another user that mentions the deleted user's email or id is
// scrubbed match-only through DELETE /v1/me. Identity-bearing strings and keys are replaced, but
// that row's own `$email` / `$displayName` / `$phoneNumber` attribute values are left as they are
// unless they themselves carry the deleted identity.
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
const DELETED = '[deleted]';
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

interface StoredRow {
  attributesText: string;
  payload: unknown;
  user_id: string | null;
}

// The stored row, with its subscriber_attributes object as stored text for a byte comparison.
async function rowOf(providerEventId: string): Promise<StoredRow> {
  const { rows } = await database.pool.query<StoredRow>(
    `SELECT payload, payload #>> '{event,subscriber_attributes}' AS "attributesText", user_id
     FROM purchase_events WHERE provider_event_id = $1`,
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

describe.skipIf(SKIP_DATABASE_TESTS)("DELETE /v1/me on another user's purchase rows (B-59.1d)", () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it("replaces the deleted email in another user's linked row and leaves that row's own $email, $displayName, and $phoneNumber byte-identical", async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const deletedEmail = uniqueEmail('learner-a');
    const otherEmail = uniqueEmail('learner-b');
    const deletedUserId = await insertUser(deletedEmail);
    const otherUserId = await insertUser(otherEmail);
    const caller = await insertSession(database.pool, { createdAt: now, userId: deletedUserId });
    const subscriberAttributes = {
      $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Bea' },
      $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail },
      $phoneNumber: { updated_at_ms: UPDATED_AT_MS, value: '+15550100' },
    };
    const eventId = await insertPurchaseEvent(
      otherUserId,
      {
        event: {
          app_user_id: otherUserId,
          contact: deletedEmail,
          product_id: PRODUCT_ID,
          subscriber_attributes: subscriberAttributes,
          type: 'RENEWAL',
        },
      },
      now,
    );
    const before = await rowOf(eventId);

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const after = await rowOf(eventId);
    expect(after.user_id).toBe(otherUserId);
    expect(after.payload).toEqual({
      event: {
        app_user_id: otherUserId,
        contact: DELETED,
        product_id: PRODUCT_ID,
        subscriber_attributes: subscriberAttributes,
        type: 'RENEWAL',
      },
    });
    expect(after.attributesText).toBe(before.attributesText);
  });

  it("replaces another user's linked $email value only when it carries the deleted identity", async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const deletedEmail = uniqueEmail('learner-a');
    const otherEmail = uniqueEmail('learner-b');
    const deletedUserId = await insertUser(deletedEmail);
    const otherUserId = await insertUser(otherEmail);
    const caller = await insertSession(database.pool, { createdAt: now, userId: deletedUserId });
    const eventId = await insertPurchaseEvent(
      otherUserId,
      {
        event: {
          app_user_id: otherUserId,
          subscriber_attributes: {
            $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Bea' },
            $email: { updated_at_ms: UPDATED_AT_MS, value: deletedEmail },
            $phoneNumber: { updated_at_ms: UPDATED_AT_MS, value: `ref:${deletedUserId}` },
          },
          type: 'TRANSFER',
        },
      },
      now,
    );

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const after = await rowOf(eventId);
    expect(after.user_id).toBe(otherUserId);
    expect(after.payload).toEqual({
      event: {
        app_user_id: otherUserId,
        subscriber_attributes: {
          $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Bea' },
          $email: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
          $phoneNumber: { updated_at_ms: UPDATED_AT_MS, value: DELETED },
        },
        type: 'TRANSFER',
      },
    });
  });
});
