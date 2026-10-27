// When Pro ends (spec "2. Pro", Server; Review Focus 1 and 2): an annual grant's expires_at is the
// expiration_at_ms of the latest grant, CANCELLATION, or SUBSCRIPTION_EXTENDED event by
// event_timestamp_ms; a lifetime grant has none. A refund (a CUSTOMER_SUPPORT CANCELLATION) revokes
// and keeps the expiry the grant set. An annual grant without expiration_at_ms fails closed: it is recorded and
// answered 200, grants nothing, moves no expiry, and logs one warning. A revoke keeps expires_at
// as it was, so a RENEWAL stamped before a recorded EXPIRATION neither re-grants nor moves
// expires_at forward. Any other annual CANCELLATION never changes the status. The annual and lifetime rows are
// independent, so an annual EXPIRATION never touches a lifetime grant.
import { randomBytes, randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { createWebhookTestApp } from '../integration/createWebhookTestApp.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const ROUTE = '/v1/webhooks/revenuecat';
const SETUP_TIMEOUT_MS = 120_000;
const DISTINCTIVE_BYTES = 12;
const T0 = 1_790_000_000_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const YEAR_MS = 31_536_000_000;
const FIRST_PERIOD_END = T0 + YEAR_MS;
const SECOND_PERIOD_END = T0 + 2 * YEAR_MS;
const PINO_WARN_LEVEL = 40;
const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createWebhookTestApp>['app'];

interface Target {
  app: TestApp;
  logLines: string[];
  revenueCatAuth: string;
  userId: string;
}

interface RowState {
  expiresAtMs: number | null;
  status: string;
}

function buildEvent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    app_user_id: randomUUID(),
    environment: 'SANDBOX',
    event_timestamp_ms: T0,
    id: randomUUID(),
    product_id: ANNUAL,
    store: 'APP_STORE',
    transaction_id: randomBytes(DISTINCTIVE_BYTES).toString('hex'),
    type: 'INITIAL_PURCHASE',
    ...overrides,
  };
}

async function setup(): Promise<Target> {
  const { app, logLines, revenueCatAuth } = createWebhookTestApp({ pool: database.pool });
  const { rows } = await database.pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
    `learner-${randomUUID()}@example.com`,
  ]);
  return { app, logLines, revenueCatAuth, userId: rows[0].id };
}

function flushLogs(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function deliver(target: Target, overrides: Record<string, unknown>): Promise<void> {
  const response = await request(target.app)
    .post(ROUTE)
    .set('Authorization', target.revenueCatAuth)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event: buildEvent({ app_user_id: target.userId, ...overrides }) }));
  expect(response.body).toEqual({ data: { status: 'recorded' } });
}

function annual(type: string, at: number, expirationAtMs?: number): Record<string, unknown> {
  return { event_timestamp_ms: at, expiration_at_ms: expirationAtMs, product_id: ANNUAL, type };
}

function lifetime(type: string, at: number): Record<string, unknown> {
  return { event_timestamp_ms: at, product_id: LIFETIME, type };
}

async function rowOf(userId: string, productId: string): Promise<RowState | undefined> {
  const { rows } = await database.pool.query<{ expires_at: Date | null; status: string }>(
    'SELECT status, expires_at FROM entitlements WHERE user_id = $1 AND product_id = $2',
    [userId, productId],
  );
  const [row] = rows;
  return row ? { expiresAtMs: row.expires_at?.getTime() ?? null, status: row.status } : undefined;
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/webhooks/revenuecat Pro expiry', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('sets expires_at from an annual INITIAL_PURCHASE expiration_at_ms', async () => {
    const target = await setup();

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'granted' });
  });

  it('moves expires_at to a later RENEWAL period end', async () => {
    const target = await setup();

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
    await deliver(target, annual('RENEWAL', FIRST_PERIOD_END, SECOND_PERIOD_END));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: SECOND_PERIOD_END, status: 'granted' });
  });

  it('keeps an older RENEWAL that arrives after a newer one from moving expires_at back', async () => {
    const target = await setup();

    await deliver(target, annual('RENEWAL', FIRST_PERIOD_END, SECOND_PERIOD_END));
    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: SECOND_PERIOD_END, status: 'granted' });
  });

  it('keeps an annual grant on CANCELLATION and takes the CANCELLATION expiration_at_ms', async () => {
    const target = await setup();
    const cancelledPeriodEnd = FIRST_PERIOD_END - DAY_MS;

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
    await deliver(target, annual('CANCELLATION', T0 + HOUR_MS, cancelledPeriodEnd));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: cancelledPeriodEnd, status: 'granted' });
  });

  it('keeps the grant through CANCELLATION then UNCANCELLATION, ending on the UNCANCELLATION expiry', async () => {
    const target = await setup();

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
    await deliver(target, annual('CANCELLATION', T0 + HOUR_MS, FIRST_PERIOD_END - DAY_MS));
    await deliver(target, annual('UNCANCELLATION', T0 + 2 * HOUR_MS, FIRST_PERIOD_END));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'granted' });
  });

  it('moves expires_at to a SUBSCRIPTION_EXTENDED period end and keeps the grant', async () => {
    const target = await setup();
    const extendedEnd = FIRST_PERIOD_END + 30 * DAY_MS;

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
    await deliver(target, annual('SUBSCRIPTION_EXTENDED', T0 + HOUR_MS, extendedEnd));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: extendedEnd, status: 'granted' });
  });

  it('revokes on a refund CANCELLATION and keeps the expires_at the grant set', async () => {
    const target = await setup();

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
    await deliver(target, {
      ...annual('CANCELLATION', T0 + HOUR_MS, FIRST_PERIOD_END - DAY_MS),
      cancel_reason: 'CUSTOMER_SUPPORT',
    });

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'revoked' });
  });

  it('never re-grants on a CANCELLATION after an EXPIRATION', async () => {
    const target = await setup();

    await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
    await deliver(target, annual('EXPIRATION', FIRST_PERIOD_END));
    await deliver(target, annual('CANCELLATION', FIRST_PERIOD_END + HOUR_MS, SECOND_PERIOD_END));

    expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'revoked' });
  });

  it('writes NULL for a lifetime NON_RENEWING_PURCHASE', async () => {
    const target = await setup();

    await deliver(target, lifetime('NON_RENEWING_PURCHASE', T0));

    expect(await rowOf(target.userId, LIFETIME)).toEqual({ expiresAtMs: null, status: 'granted' });
  });

  describe('an annual grant without expiration_at_ms fails closed', () => {
    it('records an INITIAL_PURCHASE without expiration_at_ms, grants nothing, and warns once', async () => {
      const target = await setup();

      await deliver(target, annual('INITIAL_PURCHASE', T0));
      await flushLogs();

      expect(await rowOf(target.userId, ANNUAL)).toBeUndefined();
      const { rows } = await database.pool.query<{ kind: string; product_id: string }>(
        'SELECT kind, product_id FROM purchase_events WHERE user_id = $1',
        [target.userId],
      );
      expect(rows).toEqual([{ kind: 'INITIAL_PURCHASE', product_id: ANNUAL }]);
      const warnings = target.logLines
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter(({ msg }) => msg === 'annual grant without expiration ignored');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ level: PINO_WARN_LEVEL, productId: ANNUAL, type: 'INITIAL_PURCHASE' });
    });

    it('keeps the earlier period end when a RENEWAL arrives without expiration_at_ms', async () => {
      const target = await setup();

      await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
      await deliver(target, annual('RENEWAL', FIRST_PERIOD_END - HOUR_MS));

      expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'granted' });
    });
  });

  describe('annual and lifetime rows are independent (Review Focus 1)', () => {
    it('keeps the lifetime grant when an annual EXPIRATION arrives after the lifetime purchase', async () => {
      const target = await setup();

      await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
      await deliver(target, lifetime('NON_RENEWING_PURCHASE', T0 + HOUR_MS));
      await deliver(target, annual('EXPIRATION', T0 + 2 * HOUR_MS));

      expect(await rowOf(target.userId, LIFETIME)).toEqual({ expiresAtMs: null, status: 'granted' });
      expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'revoked' });
    });

    it('keeps the lifetime grant when the annual EXPIRATION is delivered before the lifetime purchase', async () => {
      const target = await setup();

      await deliver(target, annual('EXPIRATION', T0 + 2 * HOUR_MS));
      await deliver(target, lifetime('NON_RENEWING_PURCHASE', T0 + HOUR_MS));

      expect(await rowOf(target.userId, LIFETIME)).toEqual({ expiresAtMs: null, status: 'granted' });
      expect((await rowOf(target.userId, ANNUAL))?.status).toBe('revoked');
    });
  });

  describe('an older RENEWAL after a recorded EXPIRATION (Review Focus 2)', () => {
    it('stays revoked and does not move expires_at forward', async () => {
      const target = await setup();

      await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
      await deliver(target, annual('EXPIRATION', FIRST_PERIOD_END));
      const beforeStaleRenewal = await rowOf(target.userId, ANNUAL);
      await deliver(target, annual('RENEWAL', FIRST_PERIOD_END - HOUR_MS, SECOND_PERIOD_END));

      expect(beforeStaleRenewal).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'revoked' });
      expect(await rowOf(target.userId, ANNUAL)).toEqual({ expiresAtMs: FIRST_PERIOD_END, status: 'revoked' });
    });

    it.each([
      ['RENEWAL then EXPIRATION', ['RENEWAL', 'EXPIRATION']],
      ['EXPIRATION then RENEWAL', ['EXPIRATION', 'RENEWAL']],
    ])('ends revoked on equal timestamps delivered %s', async (_label, types) => {
      const target = await setup();

      await deliver(target, annual('INITIAL_PURCHASE', T0, FIRST_PERIOD_END));
      for (const type of types) {
        await deliver(target, annual(type, FIRST_PERIOD_END, type === 'RENEWAL' ? SECOND_PERIOD_END : undefined));
      }

      expect((await rowOf(target.userId, ANNUAL))?.status).toBe('revoked');
    });
  });
});
