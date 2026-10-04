// B-59.7: DELETE /v1/me matches the deleted user's email loosely (anywhere, no boundary rule) in the
// user's own linked rows and in unlinked rows (user_id null), and strictly (whole address) in rows
// linked to another user. So a linked and an unlinked row whose only mention is glued text such as
// `<email>-INITIAL_PURCHASE` or `x<email>` are scrubbed, while another user's row carrying the same
// glued text stays byte-identical.
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
  payloadText: string;
  user_id: string | null;
}

// The stored row as text, byte for byte, with its payload parsed for structural checks.
async function rowOf(providerEventId: string): Promise<StoredRow> {
  const { rows } = await database.pool.query<StoredRow>(
    'SELECT payload, payload::text AS "payloadText", user_id FROM purchase_events WHERE provider_event_id = $1',
    [providerEventId],
  );
  const [row] = rows;
  return row;
}

function deleteWithBearer({ app }: TestApp, sessionToken: string) {
  return request(app).delete(DELETE_ME_ROUTE).set('Authorization', `Bearer ${sessionToken}`);
}

// Each case is the only mention of the deleted email in a row: the email glued to other text.
const GLUED_CASES = [
  { glue: (email: string) => `${email}-INITIAL_PURCHASE`, label: '<email>-INITIAL_PURCHASE' },
  { glue: (email: string) => `x${email}`, label: 'x<email>' },
  { glue: (email: string) => `x${email.replace('@', '%40')}`, label: 'x<local>%40<domain>' },
];

describe.skipIf(SKIP_DATABASE_TESTS)('DELETE /v1/me loose match in own and unlinked rows (B-59.7)', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it.each(GLUED_CASES)(
    "scrubs a linked and an unlinked row that carry only $label and leaves another user's such row byte-identical",
    async ({ glue }) => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const now = testApp.clock.now();
      const deletedEmail = uniqueEmail('learner-a');
      const otherEmail = uniqueEmail('learner-b');
      const deletedUserId = await insertUser(deletedEmail);
      const otherUserId = await insertUser(otherEmail);
      const caller = await insertSession(database.pool, { createdAt: now, userId: deletedUserId });
      const glued = glue(deletedEmail);

      const linkedId = await insertPurchaseEvent(
        deletedUserId,
        { event: { note: UNCHANGED_NOTE, product_id: PRODUCT_ID, transaction_ref: glued, type: 'INITIAL_PURCHASE' } },
        now,
      );
      const unlinkedId = await insertPurchaseEvent(
        null,
        {
          event: {
            note: UNCHANGED_NOTE,
            product_id: PRODUCT_ID,
            refs: { [glued]: 'keyed-by-glued-text' },
            transaction_ref: glued,
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
            note: UNCHANGED_NOTE,
            product_id: PRODUCT_ID,
            refs: { [glued]: 'keyed-by-glued-text' },
            subscriber_attributes: { $email: { updated_at_ms: UPDATED_AT_MS, value: otherEmail } },
            transaction_ref: glued,
            type: 'RENEWAL',
          },
        },
        now,
      );
      const otherBefore = await rowOf(otherId);

      const response = await deleteWithBearer(testApp, caller.sessionToken);

      expect(response.status).toBe(HTTP_NO_CONTENT);
      const linked = await rowOf(linkedId);
      expect(linked.payload).toEqual({
        event: { note: UNCHANGED_NOTE, product_id: PRODUCT_ID, transaction_ref: DELETED, type: 'INITIAL_PURCHASE' },
      });
      const unlinked = await rowOf(unlinkedId);
      expect(unlinked.user_id).toBeNull();
      expect(unlinked.payload).toEqual({
        event: {
          note: UNCHANGED_NOTE,
          product_id: PRODUCT_ID,
          refs: { [DELETED]: 'keyed-by-glued-text' },
          transaction_ref: DELETED,
          type: 'NON_RENEWING_PURCHASE',
        },
      });
      expect(unlinked.payloadText).not.toContain(glued);
      const otherAfter = await rowOf(otherId);
      expect(otherAfter.user_id).toBe(otherUserId);
      expect(otherAfter.payloadText).toBe(otherBefore.payloadText);
    },
  );
});
