// B-59.1c: DELETE /v1/me matches the deleted user's email in purchase payloads only as a whole
// address, after NFKC folding. Deleting a user whose email is a substring of another user's email
// leaves the other user's payload byte-identical, and an unlinked purchase event that carries the
// email only in a fullwidth form is still found and scrubbed.
import { randomBytes } from 'node:crypto';

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
const SETUP_TIMEOUT_MS = 120_000;
const HEX_BYTES = 6;
const DELETED = '[deleted]';
const PRODUCT_ID = 'bank-advanced';
const UPDATED_AT_MS = 1_790_000_000_000;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

// Maps printable ASCII to its fullwidth compatibility form, which NFKC folds back.
function toFullwidth(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char;
    })
    .join('');
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

// The stored row as text, byte for byte, with its payload parsed for structural checks.
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

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me email boundary (B-59.1c)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it("leaves another user's payload byte-identical when the deleted email is a substring of theirs", async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const local = `learner-${randomBytes(HEX_BYTES).toString('hex')}`;
    const email = `${local}@example.co`;
    const otherEmail = `a${local}@example.com`;
    expect(otherEmail).toContain(email);
    const userId = await insertUser(email);
    const otherUserId = await insertUser(otherEmail);
    const caller = await insertSession(database.pool, { createdAt: now, userId });
    const otherPayload = {
      event: {
        app_user_id: otherUserId,
        contact: `mailto:${otherEmail}`,
        product_id: PRODUCT_ID,
        recipients: [otherEmail, `"Other" <${otherEmail}>`],
        subscriber_attributes: { $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail } },
        type: 'RENEWAL',
        [otherEmail]: 'keyed-by-email',
      },
    };
    const otherEventId = await insertPurchaseEvent(otherUserId, otherPayload, now);
    const unlinkedOtherPayload = { event: { contact: otherEmail, type: 'TRANSFER' } };
    const unlinkedOtherEventId = await insertPurchaseEvent(null, unlinkedOtherPayload, now);
    const ownEventId = await insertPurchaseEvent(null, { event: { contact: email, type: 'TRANSFER' } }, now);
    const otherBefore = await rowOf(otherEventId);
    const unlinkedOtherBefore = await rowOf(unlinkedOtherEventId);

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const otherAfter = await rowOf(otherEventId);
    expect(otherAfter.payloadText).toBe(otherBefore.payloadText);
    expect(otherAfter.payload).toEqual(otherPayload);
    expect(otherAfter.user_id).toBe(otherUserId);
    const unlinkedOtherAfter = await rowOf(unlinkedOtherEventId);
    expect(unlinkedOtherAfter.payloadText).toBe(unlinkedOtherBefore.payloadText);
    expect(unlinkedOtherAfter.payload).toEqual(unlinkedOtherPayload);
    expect((await rowOf(ownEventId)).payload).toEqual({ event: { contact: DELETED, type: 'TRANSFER' } });
  });

  it('scrubs an unlinked purchase event that carries the email only in fullwidth form', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const email = `learner-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
    const userId = await insertUser(email);
    const caller = await insertSession(database.pool, { createdAt: now, userId });
    const fullwidthEmail = toFullwidth(email);
    const eventId = await insertPurchaseEvent(
      null,
      {
        event: {
          contact: fullwidthEmail,
          product_id: PRODUCT_ID,
          store: 'APP_STORE',
          type: 'TRANSFER',
          [`mailto:${fullwidthEmail}`]: 'keyed-by-email',
        },
      },
      now,
    );

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const after = await rowOf(eventId);
    expect(after.user_id).toBeNull();
    expect(after.payload).toEqual({
      event: {
        contact: DELETED,
        product_id: PRODUCT_ID,
        store: 'APP_STORE',
        type: 'TRANSFER',
        [DELETED]: 'keyed-by-email',
      },
    });
    expect(after.payloadText).not.toContain(fullwidthEmail);
  });
});
