// B-3.4 (B-27): the attempt counter holds under concurrency. Every verify locks the code row
// and counts the attempt in the same transaction, so 50 concurrent wrong guesses leave
// attempts at exactly 5 and the code is then exhausted, even for the right guess.
import { createHash, randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { withTransaction } from '../../clients/withTransaction.js';
import { verifyOneTimeCode } from '../../services/verifyOneTimeCode.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const CONCURRENT_GUESSES = 50;
const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 600_000;
const CODE = '362514';
const CODE_SPACE = 1_000_000;
const EMAIL_BYTES = 6;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function wrongCode(index: number): string {
  return String((Number(CODE) + index + 1) % CODE_SPACE).padStart(CODE.length, '0');
}

async function insertCode(email: string, now: Date): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    'INSERT INTO one_time_codes (email, code_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
    [email, createHash('sha256').update(CODE).digest(), new Date(now.getTime() + CODE_TTL_MS)],
  );
  const [{ id }] = rows;
  return id;
}

function verify(email: string, code: string, now: Date): Promise<boolean> {
  return withTransaction(database.pool, (client) => verifyOneTimeCode(client, { code, email, now }));
}

describe.skipIf(SKIP_DATABASE_TESTS)('verifyOneTimeCode under concurrency', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('leaves attempts at 5 after 50 concurrent wrong guesses and then rejects the right code', async () => {
    const now = new Date();
    const email = buildEmail();
    const id = await insertCode(email, now);

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_GUESSES }, (_unused, index) => verify(email, wrongCode(index), now)),
    );
    const afterExhaustion = await verify(email, CODE, now);

    expect(results.every((result) => result === false)).toBe(true);
    const { rows } = await database.pool.query<{ attempts: number; used_at: Date | null }>(
      'SELECT attempts, used_at FROM one_time_codes WHERE id = $1',
      [id],
    );
    const [{ attempts, used_at: usedAt }] = rows;
    expect(attempts).toBe(MAX_ATTEMPTS);
    expect(afterExhaustion).toBe(false);
    expect(usedAt).toBeNull();
  });

  it('accepts the right code once when two verifies race, and marks it used', async () => {
    const now = new Date();
    const email = buildEmail();
    const id = await insertCode(email, now);

    const results = await Promise.all([verify(email, CODE, now), verify(email, CODE, now)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const { rows } = await database.pool.query<{ used_at: Date | null }>(
      'SELECT used_at FROM one_time_codes WHERE id = $1',
      [id],
    );
    const [{ used_at: usedAt }] = rows;
    expect(usedAt).not.toBeNull();
  });
});
