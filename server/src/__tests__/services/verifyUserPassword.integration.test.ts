// Task 7.5 (B-68, B-77, B-79): verifyUserPassword loads the user by normalized email with
// autocommit reads only, verifies the password against the stored hash or, when there is no
// usable one (unknown email, code-only account, a string the parser rejects), against the dummy
// hash, so every call runs exactly one derivation; it derives a rehash when the stored parameters
// are old; and every derivation runs inside a hash slot. Every password is built at run time.
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { Database } from '../../clients/database.js';
import { AUTH } from '../../constants/auth.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { createDummyPasswordHash, hashPassword, verifyPassword } from '../../services/passwordHash.js';
import { createPasswordHashSlots } from '../../services/passwordHashSlots.js';
import { verifyUserPassword } from '../../services/verifyUserPassword.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const OLD_LOG_N = 16;
const SHORT_QUEUE_TIMEOUT_MS = 50;
const ONE_SLOT = 1;
const TWO_SLOTS = 2;
const SALT_FIELD = 4;
const SCRYPT_PREFIX = '$scrypt$';
const CURRENT_HASH_PREFIX = '$scrypt$v=1$ln=17,r=8,p=1$';

const realDeriveKey = promisify(scrypt) as DeriveKey;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
let dummyHash: string;

interface PasswordHashSlots {
  run<T>(task: () => Promise<T>): Promise<T>;
}

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

function saltOf(stored: string): Buffer {
  return Buffer.from(stored.split('$')[SALT_FIELD] ?? '', 'base64');
}

function createSlots(concurrency = TWO_SLOTS): PasswordHashSlots {
  return createPasswordHashSlots({ concurrency, queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS });
}

// Records each derivation's salt and whether it ran inside a slot of `inner`.
function createObservedDerivation(inner: PasswordHashSlots) {
  let depth = 0;
  const derivations: Array<{ isInSlot: boolean; salt: Buffer }> = [];
  const slots: PasswordHashSlots = {
    async run(task) {
      return inner.run(async () => {
        depth += 1;
        try {
          return await task();
        } finally {
          depth -= 1;
        }
      });
    },
  };
  const deriveKey: DeriveKey = (input, salt, keyBytes, options) => {
    derivations.push({ isInSlot: depth > 0, salt: Buffer.from(salt) });
    return realDeriveKey(input, salt, keyBytes, options);
  };
  return { deriveKey, derivations, slots };
}

// The pool with connect() refused, so a call that opens a transaction or checks out a client fails.
function createAutocommitOnlyDatabase(): Database {
  return {
    connect: (() => Promise.reject(new Error('verifyUserPassword must not check out a client'))) as Database['connect'],
    query: database.pool.query.bind(database.pool) as Database['query'],
  };
}

async function insertUser(email: string, passwordHash: string | null): Promise<string> {
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, password_updated_at)
     VALUES ($1, $2::text, CASE WHEN $2::text IS NULL THEN NULL ELSE now() END) RETURNING id`,
    [email, passwordHash],
  );
  return rows[0]?.id ?? '';
}

async function readStoredHash(userId: string): Promise<string | null> {
  const { rows } = await database.pool.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  return rows[0]?.password_hash ?? null;
}

function hashWithOldParameters(value: string): Promise<string> {
  const { HASH } = AUTH.PASSWORD;
  return hashPassword(value, {
    params: { keyBytes: HASH.KEY_BYTES, logN: OLD_LOG_N, p: HASH.P, r: HASH.R, saltBytes: HASH.SALT_BYTES },
  });
}

describe.skipIf(SKIP_DATABASE_TESTS)('verifyUserPassword', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
    dummyHash = await createDummyPasswordHash();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it(
    'resolves the user id and the verified stored hash, with no rehash, for the right password at current parameters',
    async () => {
      const { deriveKey, derivations, slots } = createObservedDerivation(createSlots());
      const email = buildEmail();
      const value = buildPassword();
      const storedHash = await hashPassword(value);
      const userId = await insertUser(email, storedHash);

      const result = await verifyUserPassword(createAutocommitOnlyDatabase(), {
        deriveKey,
        dummyHash,
        email,
        normalizedPassword: value,
        slots,
      });

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
      expect(result?.verifiedHash).toBe(storedHash);
      expect(result?.rehash).toBeUndefined();
      expect(derivations).toHaveLength(1);
      expect(derivations[0]?.salt.equals(saltOf(storedHash))).toBe(true);
      expect(derivations[0]?.isInSlot).toBe(true);
      expect(await readStoredHash(userId)).toBe(storedHash);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'resolves null after one derivation against the stored hash for a wrong password',
    async () => {
      const { deriveKey, derivations, slots } = createObservedDerivation(createSlots());
      const email = buildEmail();
      const storedHash = await hashPassword(buildPassword());
      await insertUser(email, storedHash);

      const result = await verifyUserPassword(createAutocommitOnlyDatabase(), {
        deriveKey,
        dummyHash,
        email,
        normalizedPassword: buildPassword(),
        slots,
      });

      expect(result).toBeNull();
      expect(
        derivations.map(({ isInSlot, salt }) => ({ isInSlot, isStored: salt.equals(saltOf(storedHash)) })),
      ).toEqual([{ isInSlot: true, isStored: true }]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'resolves null after one derivation against the dummy hash for an unknown email, a code-only account, and stored strings the parser rejects',
    async () => {
      const { deriveKey, derivations, slots } = createObservedDerivation(createSlots());
      const codeOnlyEmail = buildEmail();
      const unparseableEmail = buildEmail();
      const truncatedEmail = buildEmail();
      const otherAlgorithmEmail = buildEmail();
      await insertUser(codeOnlyEmail, null);
      await insertUser(unparseableEmail, SCRYPT_PREFIX.concat('v=1$ln=17,r=8,p=1$', buildPassword(), '$!'));
      await insertUser(truncatedEmail, (await hashPassword(buildPassword())).slice(0, -1));
      await insertUser(otherAlgorithmEmail, (await hashPassword(buildPassword())).replace('$v=1$', '$v=2$'));
      const dummySalt = saltOf(dummyHash);

      const outcomes = [];
      for (const email of [buildEmail(), codeOnlyEmail, unparseableEmail, truncatedEmail, otherAlgorithmEmail]) {
        derivations.length = 0;
        const result = await verifyUserPassword(createAutocommitOnlyDatabase(), {
          deriveKey,
          dummyHash,
          email,
          normalizedPassword: buildPassword(),
          slots,
        });
        outcomes.push({
          derivations: derivations.map(({ isInSlot, salt }) => ({ isDummy: salt.equals(dummySalt), isInSlot })),
          result,
        });
      }

      const expected = { derivations: [{ isDummy: true, isInSlot: true }], result: null };
      expect(outcomes).toEqual([expected, expected, expected, expected, expected]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'derives a current-parameter rehash for an ln=16 hash, inside a slot, without writing it',
    async () => {
      const { deriveKey, derivations, slots } = createObservedDerivation(createSlots());
      const email = buildEmail();
      const value = buildPassword();
      const oldHash = await hashWithOldParameters(value);
      const userId = await insertUser(email, oldHash);

      const result = await verifyUserPassword(createAutocommitOnlyDatabase(), {
        deriveKey,
        dummyHash,
        email,
        normalizedPassword: value,
        slots,
      });

      expect(result?.userId).toBe(userId);
      expect(result?.verifiedHash).toBe(oldHash);
      const rehash = String(result?.rehash);
      expect(rehash.startsWith(CURRENT_HASH_PREFIX)).toBe(true);
      expect(await verifyPassword(value, rehash)).toBe(true);
      expect(derivations).toHaveLength(2);
      expect(derivations.every(({ isInSlot }) => isInSlot)).toBe(true);
      expect(await readStoredHash(userId)).toBe(oldHash);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'derives no rehash for a wrong password against an ln=16 hash',
    async () => {
      const { deriveKey, derivations, slots } = createObservedDerivation(createSlots());
      const email = buildEmail();
      const oldHash = await hashWithOldParameters(buildPassword());
      await insertUser(email, oldHash);

      const result = await verifyUserPassword(createAutocommitOnlyDatabase(), {
        deriveKey,
        dummyHash,
        email,
        normalizedPassword: buildPassword(),
        slots,
      });

      expect(result).toBeNull();
      expect(derivations).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects with SERVER_BUSY and derives nothing when no slot frees within the queue timeout',
    async () => {
      const inner = createPasswordHashSlots({ concurrency: ONE_SLOT, queueTimeoutMs: SHORT_QUEUE_TIMEOUT_MS });
      const { deriveKey, derivations, slots } = createObservedDerivation(inner);
      let release: () => void = () => {};
      const held = inner.run(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const email = buildEmail();
      const value = buildPassword();
      await insertUser(email, await hashPassword(value));

      try {
        await expect(
          verifyUserPassword(createAutocommitOnlyDatabase(), {
            deriveKey,
            dummyHash,
            email,
            normalizedPassword: value,
            slots,
          }),
        ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
        expect(derivations).toEqual([]);
      } finally {
        release();
        await held;
      }
    },
    TEST_TIMEOUT_MS,
  );
});
