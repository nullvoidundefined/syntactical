// B-3.4 (B-27): the code's hash is compared with crypto.timingSafeEqual against the stored
// 32-byte SHA-256, never with === or Buffer.equals.
import { createHash } from 'node:crypto';

import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

const { timingSafeEqualSpy } = vi.hoisted(() => ({ timingSafeEqualSpy: vi.fn() }));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  timingSafeEqualSpy.mockImplementation(actual.timingSafeEqual);
  return { ...actual, default: { ...actual, timingSafeEqual: timingSafeEqualSpy }, timingSafeEqual: timingSafeEqualSpy };
});

const CODE = '480913';
const WRONG_CODE = '480914';
const EMAIL = 'learner@example.com';
const CODE_TTL_MS = 600_000;
const SHA256_BYTES = 32;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// A client that serves one active code row and records every statement it is sent.
function createFakeClient(now: Date) {
  const statements: string[] = [];
  const row = { attempts: 0, code_hash: sha256(CODE), expires_at: new Date(now.getTime() + CODE_TTL_MS), id: 'code-1' };
  const client = {
    async query(text: string) {
      statements.push(text);
      return /^\s*SELECT/i.test(text) ? { rowCount: 1, rows: [row] } : { rowCount: 1, rows: [] };
    },
  };
  return { client: client as unknown as pg.PoolClient, statements };
}

describe('verifyOneTimeCode hash comparison', () => {
  it('accepts the right code and rejects a wrong one through crypto.timingSafeEqual on 32-byte digests', async () => {
    const { verifyOneTimeCode } = await import('../../services/verifyOneTimeCode.js');
    const now = new Date();

    const right = await verifyOneTimeCode(createFakeClient(now).client, { code: CODE, email: EMAIL, now });
    const wrong = await verifyOneTimeCode(createFakeClient(now).client, { code: WRONG_CODE, email: EMAIL, now });

    expect(right).toBe(true);
    expect(wrong).toBe(false);
    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(2);
    for (const [left, stored] of timingSafeEqualSpy.mock.calls as [Buffer, Buffer][]) {
      expect(left).toHaveLength(SHA256_BYTES);
      expect(stored).toHaveLength(SHA256_BYTES);
    }
  });

  it('takes the code row with SELECT ... FOR UPDATE before counting the attempt', async () => {
    const { verifyOneTimeCode } = await import('../../services/verifyOneTimeCode.js');
    const now = new Date();
    const { client, statements } = createFakeClient(now);

    await verifyOneTimeCode(client, { code: WRONG_CODE, email: EMAIL, now });

    const [select, ...rest] = statements;
    expect(select).toMatch(/FOR UPDATE/i);
    expect(rest.some((text) => /attempts\s*=\s*attempts\s*\+\s*1/i.test(text))).toBe(true);
  });
});
