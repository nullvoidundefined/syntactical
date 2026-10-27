// The active-Pro rule (spec "2. Pro", Server). readActiveProRows(queryable, userId, now) returns
// the user's granted rows of either Pro product, from any source, whose expires_at is NULL or later
// than now, with product, source, and expiry; hasPro is true exactly when there is one. Expired or
// revoked rows, other products, and other users' rows never count. now is a parameter, so expiry is
// tested without waiting. Review Focus 1: a revoked annual row never hides a granted lifetime row.
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { hasPro } from '../../services/hasPro.js';
import { readActiveProRows } from '../../services/readActiveProRows.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';
import { insertSession } from '../integration/insertSession.js';
import { SKIP_DATABASE_TESTS } from '../integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const NOW = new Date('2026-11-01T12:00:00.000Z');
const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';
const NOT_PRO = 'syntactical.python.medium';

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

interface Row {
  expiresAt?: Date | null;
  productId: string;
  source?: string;
  status?: 'granted' | 'revoked';
}

async function newUserId(): Promise<string> {
  const { userId } = await insertSession(database.pool, { createdAt: NOW });
  return userId;
}

async function insertRow(userId: string, row: Row): Promise<void> {
  const { expiresAt = null, productId, source = 'revenuecat', status = 'granted' } = row;
  await database.pool.query(
    'INSERT INTO entitlements (user_id, product_id, source, status, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [userId, productId, source, status, expiresAt],
  );
}

describe.skipIf(SKIP_DATABASE_TESTS)('hasPro', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('is false with no entitlement row', async () => {
    const userId = await newUserId();

    expect(await hasPro(database.pool, userId, NOW)).toBe(false);
  });

  it('is true for a granted lifetime row with no expiry', async () => {
    const userId = await newUserId();
    await insertRow(userId, { productId: LIFETIME });

    expect(await hasPro(database.pool, userId, NOW)).toBe(true);
  });

  it('is true for a granted annual row that expires after now', async () => {
    const userId = await newUserId();
    await insertRow(userId, { expiresAt: new Date(NOW.getTime() + DAY_MS), productId: ANNUAL });

    expect(await hasPro(database.pool, userId, NOW)).toBe(true);
  });

  it('is false for a granted annual row that expires exactly at now or before it', async () => {
    const atNow = await newUserId();
    const before = await newUserId();
    await insertRow(atNow, { expiresAt: NOW, productId: ANNUAL });
    await insertRow(before, { expiresAt: new Date(NOW.getTime() - 1), productId: ANNUAL });

    expect(await hasPro(database.pool, atNow, NOW)).toBe(false);
    expect(await hasPro(database.pool, before, NOW)).toBe(false);
  });

  it('turns false for the same annual row once now passes its expiry', async () => {
    const userId = await newUserId();
    const expiresAt = new Date(NOW.getTime() + DAY_MS);
    await insertRow(userId, { expiresAt, productId: ANNUAL });

    expect(await hasPro(database.pool, userId, NOW)).toBe(true);
    expect(await hasPro(database.pool, userId, new Date(expiresAt.getTime() + 1))).toBe(false);
  });

  it('is false for a revoked row of either product, even with no expiry', async () => {
    const userId = await newUserId();
    await insertRow(userId, { productId: LIFETIME, status: 'revoked' });
    await insertRow(userId, { productId: ANNUAL, status: 'revoked' });

    expect(await hasPro(database.pool, userId, NOW)).toBe(false);
  });

  it('is true for an admin grant on the lifetime product, whatever its source', async () => {
    const userId = await newUserId();
    await insertRow(userId, { productId: LIFETIME, source: 'admin' });

    expect(await hasPro(database.pool, userId, NOW)).toBe(true);
  });

  it('is false for a granted row of a product that is not Pro', async () => {
    const userId = await newUserId();
    await insertRow(userId, { productId: NOT_PRO });

    expect(await hasPro(database.pool, userId, NOW)).toBe(false);
  });

  it('is false when only another user holds Pro', async () => {
    const userId = await newUserId();
    const otherUserId = await newUserId();
    await insertRow(otherUserId, { productId: LIFETIME });

    expect(await hasPro(database.pool, userId, NOW)).toBe(false);
  });

  it('is true with a granted lifetime row beside a revoked annual row (Review Focus 1)', async () => {
    const userId = await newUserId();
    await insertRow(userId, { expiresAt: new Date(NOW.getTime() - DAY_MS), productId: ANNUAL, status: 'revoked' });
    await insertRow(userId, { productId: LIFETIME });

    expect(await hasPro(database.pool, userId, NOW)).toBe(true);
  });
});

describe.skipIf(SKIP_DATABASE_TESTS)('readActiveProRows', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('returns every active Pro row with its product, source, and expiry, sorted by product', async () => {
    const userId = await newUserId();
    const annualExpiry = new Date(NOW.getTime() + DAY_MS);
    await insertRow(userId, { productId: LIFETIME, source: 'admin' });
    await insertRow(userId, { expiresAt: annualExpiry, productId: ANNUAL });

    expect(await readActiveProRows(database.pool, userId, NOW)).toEqual([
      { expiresAt: annualExpiry, productId: ANNUAL, source: 'revenuecat' },
      { expiresAt: null, productId: LIFETIME, source: 'admin' },
    ]);
  });

  it('leaves out an expired annual row, a revoked lifetime row, and a row of another product', async () => {
    const userId = await newUserId();
    await insertRow(userId, { expiresAt: NOW, productId: ANNUAL });
    await insertRow(userId, { productId: LIFETIME, status: 'revoked' });
    await insertRow(userId, { productId: NOT_PRO });

    expect(await readActiveProRows(database.pool, userId, NOW)).toEqual([]);
  });
});
