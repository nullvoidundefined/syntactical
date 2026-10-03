// B-59.1e: DELETE /v1/me scrubs purchase rows that carry the deleted user's email only in
// percent-encoded form (fully encoded `%40`, or after an encoded `?email%3D`). A row linked to the
// deleted user, an unlinked row, and a row linked to another user are all found and scrubbed; the
// other user's row is scrubbed match-only, so its own `$email` attribute value is left as it is.
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
const UNCHANGED_NOTE = 'https://shop.example/r?ref%3Dspring%26note%3Ddiscount%ZZ';

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

interface Mentions {
  contact: string;
  redirect: string;
}

// Fully encoded: the `@` is `%40`, so the stored text never holds the email itself.
function fullyEncodedMentions(email: string): Mentions {
  return {
    contact: encodeURIComponent(email),
    redirect: `https://shop.example/welcome?email%3D${encodeURIComponent(email)}`,
  };
}

// Only the separator is encoded: the email follows `%3D` (or `%2F`), so it is not a whole address
// until decoded.
function encodedSeparatorMentions(email: string): Mentions {
  return {
    contact: `/users%2F${email}`,
    redirect: `https://shop.example/welcome?email%3D${email}`,
  };
}

const MENTION_CASES = [
  { buildMentions: fullyEncodedMentions, label: 'fully encoded %40' },
  { buildMentions: encodedSeparatorMentions, label: '?email%3D<email>' },
];

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me on percent-encoded email mentions (B-59.1e)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it.each(MENTION_CASES)(
    "scrubs a linked, an unlinked, and another user's row that carry the email only as $label",
    async ({ buildMentions }) => {
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
      const mentions = buildMentions(deletedEmail);

      const linkedId = await insertPurchaseEvent(
        deletedUserId,
        {
          event: {
            ...mentions,
            note: UNCHANGED_NOTE,
            product_id: PRODUCT_ID,
            type: 'INITIAL_PURCHASE',
          },
        },
        now,
      );
      const unlinkedId = await insertPurchaseEvent(
        null,
        {
          event: {
            ...mentions,
            note: UNCHANGED_NOTE,
            product_id: PRODUCT_ID,
            type: 'NON_RENEWING_PURCHASE',
          },
        },
        now,
      );
      const otherAttributes = {
        $displayName: { updated_at_ms: UPDATED_AT_MS, value: 'Bea' },
        $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail },
      };
      const otherId = await insertPurchaseEvent(
        otherUserId,
        {
          event: {
            ...mentions,
            app_user_id: otherUserId,
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
      const scrubbedMentions = { contact: DELETED, redirect: DELETED };
      expect((await rowOf(linkedId)).payload).toEqual({
        event: {
          ...scrubbedMentions,
          note: UNCHANGED_NOTE,
          product_id: PRODUCT_ID,
          type: 'INITIAL_PURCHASE',
        },
      });
      expect((await rowOf(unlinkedId)).payload).toEqual({
        event: {
          ...scrubbedMentions,
          note: UNCHANGED_NOTE,
          product_id: PRODUCT_ID,
          type: 'NON_RENEWING_PURCHASE',
        },
      });
      const other = await rowOf(otherId);
      expect(other.user_id).toBe(otherUserId);
      expect(other.payload).toEqual({
        event: {
          ...scrubbedMentions,
          app_user_id: otherUserId,
          note: UNCHANGED_NOTE,
          product_id: PRODUCT_ID,
          subscriber_attributes: otherAttributes,
          type: 'RENEWAL',
        },
      });
      expect(JSON.stringify(other.payload)).not.toContain(mentions.redirect);
    },
  );
});
