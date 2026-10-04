// B-59.10: DELETE /v1/me finds and scrubs purchase rows whose only mention of the deleted user's email
// is written with fullwidth percent escapes (the `@` as `％４０`), and which hold no ASCII `%` at all. The
// SQL prefilter's `%` arm must therefore select a row holding only a fullwidth `％`, and the identity match
// must decode the NFKC-normalized text. An unlinked row is scrubbed in the default mode; another user's row
// carrying the fullwidth-encoded whole address is scrubbed match-only, so its own `$email` attribute value
// is left as it is.
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
const UNCHANGED_NOTE = 'gift card applied';
const FULLWIDTH_ENCODED_AT = '％４０';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomBytes(HEX_BYTES).toString('hex')}@example.com`;
}

// The email with its `@` written as a fullwidth percent escape: no ASCII `%` and no `@` in the text.
function fullwidthEncoded(email: string): string {
  return email.replace('@', FULLWIDTH_ENCODED_AT);
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
  payload: unknown;
  user_id: string | null;
}

async function rowOf(providerEventId: string): Promise<StoredRow> {
  const { rows } = await database.pool.query<StoredRow>(
    'SELECT payload, user_id FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me on fullwidth percent-escaped email mentions (B-59.10)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('scrubs an unlinked row whose only mention is the fullwidth-encoded email', async () => {
    const testApp = createAuthTestApp({ pool: database.pool });
    const now = testApp.clock.now();
    const deletedEmail = uniqueEmail('learner-a');
    const deletedUserId = await insertUser(deletedEmail);
    const caller = await insertSession(database.pool, {
      createdAt: now,
      userId: deletedUserId,
    });
    const encoded = fullwidthEncoded(deletedEmail);
    const unlinkedId = await insertPurchaseEvent(
      null,
      {
        event: {
          contact: encoded,
          note: UNCHANGED_NOTE,
          product_id: PRODUCT_ID,
          type: 'NON_RENEWING_PURCHASE',
        },
      },
      now,
    );

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const unlinked = await rowOf(unlinkedId);
    expect(unlinked.user_id).toBeNull();
    expect(unlinked.payload).toEqual({
      event: {
        contact: DELETED,
        note: UNCHANGED_NOTE,
        product_id: PRODUCT_ID,
        type: 'NON_RENEWING_PURCHASE',
      },
    });
    expect(JSON.stringify(unlinked.payload)).not.toContain(encoded);
  });

  it("scrubs another user's row carrying the fullwidth-encoded whole address, match-only", async () => {
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
    const mention = `mailto:${fullwidthEncoded(deletedEmail)}`;
    const otherAttributes = {
      $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Bea' },
      $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail },
    };
    const otherId = await insertPurchaseEvent(
      otherUserId,
      {
        event: {
          app_user_id: otherUserId,
          gifted_to: mention,
          note: UNCHANGED_NOTE,
          product_id: PRODUCT_ID,
          subscriber_attributes: otherAttributes,
          type: 'RENEWAL',
        },
      },
      now,
    );

    const response = await deleteWithBearer(testApp, caller.sessionToken);

    expect(response.status).toBe(HTTP_NO_CONTENT);
    const other = await rowOf(otherId);
    expect(other.user_id).toBe(otherUserId);
    expect(other.payload).toEqual({
      event: {
        app_user_id: otherUserId,
        gifted_to: DELETED,
        note: UNCHANGED_NOTE,
        product_id: PRODUCT_ID,
        subscriber_attributes: otherAttributes,
        type: 'RENEWAL',
      },
    });
  });
});
