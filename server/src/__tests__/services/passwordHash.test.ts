// B-66, B-67, B-68 (needsRehash): scrypt password hashing. The stored string records the
// algorithm, version, and parameters; verification derives with the stored salt and parameters,
// compares keys with crypto.timingSafeEqual (injectable as deps.compare), and fails closed on any malformed stored string.
// Every password is built at run time.
import * as actualCrypto from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { createDummyPasswordHash, hashPassword, needsRehash, verifyPassword } from '../../services/passwordHash.js';
import type { PasswordHashParams } from '../../types/PasswordHashParams.js';

const STORED_FORMAT = /^\$scrypt\$v=1\$ln=17,r=8,p=1\$[A-Za-z0-9+/]{43}\$[A-Za-z0-9+/]{86}$/;
const CURRENT_PARAMS: PasswordHashParams = { logN: 17, r: 8, p: 1, saltBytes: 32, keyBytes: 64 };
const REAL_SCRYPT_TIMEOUT_MS = 30_000;

type DeriveOptions = { N: number; r: number; p: number; maxmem: number };

// A fast stand-in for scrypt: deterministic in the input, salt, key length, and cost parameters,
// so a wrong password, salt, or parameter set gives a different key.
async function fakeDeriveKey(input: Buffer, salt: Buffer, keyBytes: number, options: DeriveOptions): Promise<Buffer> {
  return actualCrypto
    .createHash('shake256', { outputLength: keyBytes })
    .update(`${options.N},${options.r},${options.p}:`)
    .update(salt)
    .update(input)
    .digest();
}

function createDeriveKeySpy() {
  return vi.fn(fakeDeriveKey);
}

function buildPassword(): string {
  return actualCrypto.randomBytes(18).toString('base64url');
}

// Fullwidth compatibility forms of printable ASCII; NFKC maps each back to its ASCII character.
function toFullwidth(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x21 && code <= 0x7e ? String.fromCodePoint(code + 0xfee0) : character;
    })
    .join('');
}

function splitStored(stored: string): { prefix: string; salt: string; key: string } {
  const segments = stored.split('$');
  return { prefix: segments.slice(0, 4).join('$'), salt: segments[4] ?? '', key: segments[5] ?? '' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AUTH.PASSWORD', () => {
  it('holds the scrypt parameters and the hash queue timeout from the spec', () => {
    expect(AUTH.PASSWORD.HASH).toEqual({
      LOG_N: 17,
      R: 8,
      P: 1,
      SALT_BYTES: 32,
      KEY_BYTES: 64,
      MAXMEM: 268_435_456,
    });
    expect(AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS).toBe(5_000);
  });
});

describe('hashPassword', () => {
  it('returns the PHC string with algorithm, version, and current parameters, a 32-byte salt and a 64-byte key', async () => {
    const stored = await hashPassword(buildPassword(), { deriveKey: fakeDeriveKey });

    expect(stored).toMatch(STORED_FORMAT);
    const { salt, key } = splitStored(stored);
    expect(Buffer.from(salt, 'base64')).toHaveLength(32);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
  });

  it('draws a 32-byte salt from randomBytes and derives with N 2^17, r 8, p 1, maxmem 256 MiB, key length 64', async () => {
    const password = buildPassword();
    const saltBytes = actualCrypto.randomBytes(32);
    const randomBytes = vi.fn((size: number) => {
      expect(size).toBe(32);
      return Buffer.from(saltBytes);
    });
    const deriveKey = createDeriveKeySpy();

    const stored = await hashPassword(password, { deriveKey, randomBytes });

    expect(randomBytes).toHaveBeenCalledWith(32);
    expect(deriveKey).toHaveBeenCalledTimes(1);
    const [input, salt, keyBytes, options] = deriveKey.mock.calls[0]!;
    expect(Buffer.isBuffer(input)).toBe(true);
    expect(input.equals(Buffer.from(password.normalize('NFKC'), 'utf8'))).toBe(true);
    expect(salt.equals(saltBytes)).toBe(true);
    expect(keyBytes).toBe(64);
    expect(options).toMatchObject({ N: 131_072, r: 8, p: 1, maxmem: 268_435_456 });
    expect(splitStored(stored).salt).toBe(saltBytes.toString('base64').replace(/=+$/, ''));
  });

  it('gives two different strings for one password, and both verify', async () => {
    const password = buildPassword();

    const first = await hashPassword(password, { deriveKey: fakeDeriveKey });
    const second = await hashPassword(password, { deriveKey: fakeDeriveKey });

    expect(first).not.toBe(second);
    expect(splitStored(first).salt).not.toBe(splitStored(second).salt);
    await expect(verifyPassword(password, first, { deriveKey: fakeDeriveKey })).resolves.toBe(true);
    await expect(verifyPassword(password, second, { deriveKey: fakeDeriveKey })).resolves.toBe(true);
  });

  it('records injected parameters in the stored string and derives with them', async () => {
    const deriveKey = createDeriveKeySpy();

    const stored = await hashPassword(buildPassword(), {
      deriveKey,
      params: { ...CURRENT_PARAMS, logN: 16, p: 2 },
    });

    expect(stored.startsWith('$scrypt$v=1$ln=16,r=8,p=2$')).toBe(true);
    expect(deriveKey.mock.calls[0]![3]).toMatchObject({ N: 65_536, r: 8, p: 2 });
  });

  it('never returns or logs the password', async () => {
    const password = buildPassword();
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    const stored = await hashPassword(password, { deriveKey: fakeDeriveKey });
    await verifyPassword(password, stored, { deriveKey: fakeDeriveKey });
    await verifyPassword(`${password}x`, stored, { deriveKey: fakeDeriveKey });
    await verifyPassword(password, `${stored.slice(0, 30)}`, { deriveKey: fakeDeriveKey });

    expect(stored).not.toContain(password);
    expect(stored).not.toContain(Buffer.from(password, 'utf8').toString('base64').replace(/=+$/, ''));
    for (const spy of consoleSpies) {
      for (const args of spy.mock.calls) {
        expect(JSON.stringify(args.map(String))).not.toContain(password);
      }
    }
  });
});

describe('verifyPassword', () => {
  it('returns false for a different password and for the same password plus a trailing space', async () => {
    const password = buildPassword();
    const stored = await hashPassword(password, { deriveKey: fakeDeriveKey });

    await expect(verifyPassword(buildPassword(), stored, { deriveKey: fakeDeriveKey })).resolves.toBe(false);
    await expect(verifyPassword(`${password} `, stored, { deriveKey: fakeDeriveKey })).resolves.toBe(false);
  });

  it('compares the two 64-byte keys through the injected compare, and its answer decides the result', async () => {
    const password = buildPassword();
    const stored = await hashPassword(password, { deriveKey: fakeDeriveKey });

    for (const [candidate, compareAnswer] of [
      [password, true],
      [buildPassword(), false],
      [buildPassword(), true],
      [password, false],
    ] as const) {
      const compare = vi.fn((left: Buffer, right: Buffer) => {
        expect(left.byteLength).toBe(64);
        expect(right.byteLength).toBe(64);
        return compareAnswer;
      });

      const result = await verifyPassword(candidate, stored, { deriveKey: fakeDeriveKey, compare });

      expect(compare).toHaveBeenCalledTimes(1);
      expect(result).toBe(compareAnswer);
    }
  });

  it('defaults compare to crypto.timingSafeEqual semantics: an equal-length mismatch is false and does not throw', async () => {
    const password = buildPassword();
    const stored = await hashPassword(password, { deriveKey: fakeDeriveKey });
    const { prefix, salt, key } = splitStored(stored);
    const flipped = Buffer.from(key, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = `${prefix}$${salt}$${flipped.toString('base64').replace(/=+$/, '')}`;

    await expect(verifyPassword(password, tampered, { deriveKey: fakeDeriveKey })).resolves.toBe(false);
  });

  it('returns false without throwing for malformed, truncated, or foreign stored strings', async () => {
    const password = buildPassword();
    const valid = await hashPassword(password, { deriveKey: fakeDeriveKey });
    const { prefix, salt, key } = splitStored(valid);
    const malformed = {
      empty: '',
      truncatedKey: valid.slice(0, -10),
      truncatedParams: valid.slice(0, 20),
      missingKey: `${prefix}$${salt}`,
      extraSegment: `${valid}$${key}`,
      nonBase64Salt: `${prefix}$${'!'.repeat(salt.length)}$${key}`,
      nonBase64Key: `${prefix}$${salt}$${'*'.repeat(key.length)}`,
      shortKey: `${prefix}$${salt}$${key.slice(0, 43)}`,
      argon2id: valid.replace('$scrypt$', '$argon2id$'),
      versionTwo: valid.replace('$v=1$', '$v=2$'),
      notAHash: actualCrypto.randomBytes(24).toString('hex'),
    };

    for (const [name, stored] of Object.entries(malformed)) {
      await expect(
        verifyPassword(password, stored, { deriveKey: fakeDeriveKey }),
        `${name} should verify as false`,
      ).resolves.toBe(false);
    }
  });

  it('verifies NFKC-equivalent forms of one password against each other', async () => {
    const base = buildPassword();
    const composed = `${base}${String.fromCodePoint(0xe9)}`;
    const compatibility = `${toFullwidth(base)}e${String.fromCodePoint(0x301)}`;
    expect(compatibility).not.toBe(composed);
    expect(compatibility.normalize('NFKC')).toBe(composed.normalize('NFKC'));

    const stored = await hashPassword(composed, { deriveKey: fakeDeriveKey });
    const storedFromCompatibility = await hashPassword(compatibility, { deriveKey: fakeDeriveKey });

    await expect(verifyPassword(compatibility, stored, { deriveKey: fakeDeriveKey })).resolves.toBe(true);
    await expect(verifyPassword(composed, storedFromCompatibility, { deriveKey: fakeDeriveKey })).resolves.toBe(true);
  });

  it('verifies a hash made with older parameters, deriving with the stored parameters', async () => {
    const password = buildPassword();
    const stored = await hashPassword(password, {
      deriveKey: fakeDeriveKey,
      params: { ...CURRENT_PARAMS, logN: 16 },
    });
    const deriveKey = createDeriveKeySpy();

    await expect(verifyPassword(password, stored, { deriveKey })).resolves.toBe(true);
    expect(deriveKey.mock.calls[0]![3]).toMatchObject({ N: 65_536, r: 8, p: 1 });
  });
});

describe('needsRehash', () => {
  it('is false for a hash made with the current parameters', async () => {
    const stored = await hashPassword(buildPassword(), { deriveKey: fakeDeriveKey });

    expect(needsRehash(stored)).toBe(false);
    expect(needsRehash(stored, CURRENT_PARAMS)).toBe(false);
  });

  it.each([
    ['ln=16', { logN: 16 }],
    ['p=2', { p: 2 }],
    ['r=4', { r: 4 }],
    ['a 16-byte salt', { saltBytes: 16 }],
    ['a 32-byte key', { keyBytes: 32 }],
  ])('is true for a hash made with %s, and that hash still verifies', async (_label, change) => {
    const password = buildPassword();
    const stored = await hashPassword(password, {
      deriveKey: fakeDeriveKey,
      params: { ...CURRENT_PARAMS, ...change },
    });

    expect(needsRehash(stored)).toBe(true);
    await expect(verifyPassword(password, stored, { deriveKey: fakeDeriveKey })).resolves.toBe(true);
  });

  it('is true when the current parameters move past the stored ones', async () => {
    const stored = await hashPassword(buildPassword(), { deriveKey: fakeDeriveKey });

    expect(needsRehash(stored, { ...CURRENT_PARAMS, logN: 16, p: 2 })).toBe(true);
  });
});

describe('createDummyPasswordHash', () => {
  it('returns a well-formed current-parameter hash that no run-time password matches', async () => {
    const dummy = await createDummyPasswordHash({ deriveKey: fakeDeriveKey });

    expect(dummy).toMatch(STORED_FORMAT);
    expect(needsRehash(dummy)).toBe(false);
    await expect(verifyPassword(buildPassword(), dummy, { deriveKey: fakeDeriveKey })).resolves.toBe(false);
  });
});

describe('real scrypt', () => {
  it(
    'round-trips one uninjected hash and verify, so maxmem is high enough for N = 2^17',
    async () => {
      const password = buildPassword();

      const stored = await hashPassword(password);

      expect(stored).toMatch(STORED_FORMAT);
      await expect(verifyPassword(password, stored)).resolves.toBe(true);
      await expect(verifyPassword(`${password} `, stored)).resolves.toBe(false);
    },
    REAL_SCRYPT_TIMEOUT_MS,
  );
});
