// Checks a one-time code inside the caller's transaction (B-27). The email's newest live code
// is locked with SELECT ... FOR UPDATE, so concurrent verifies queue on it; an exhausted or
// expired code is refused before counting; otherwise the attempt is counted in the same
// transaction and the hashes are compared with crypto.timingSafeEqual. A match marks the code
// used, so it can never verify twice. The caller commits even on a mismatch, keeping the count.
import { timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

import { AUTH } from '../constants/auth.js';

import { sha256 } from './sha256.js';

const {
  CODE: { MAX_ATTEMPTS },
} = AUTH;

interface VerifyOneTimeCodeInput {
  code: string;
  // Already normalized by the request schema.
  email: string;
  now: Date;
}

interface CodeRow {
  attempts: number;
  code_hash: Buffer;
  expires_at: Date;
  id: string;
}

async function verifyOneTimeCode(client: pg.PoolClient, input: VerifyOneTimeCodeInput): Promise<boolean> {
  const { code, email, now } = input;
  const { rows } = await client.query<CodeRow>(
    `SELECT id, code_hash, attempts, expires_at FROM one_time_codes
     WHERE email = $1 AND used_at IS NULL AND invalidated_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [email],
  );
  const [row] = rows;
  if (!row) {
    return false;
  }
  const { attempts, code_hash: codeHash, expires_at: expiresAt, id } = row;
  if (attempts >= MAX_ATTEMPTS || expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  await client.query('UPDATE one_time_codes SET attempts = attempts + 1 WHERE id = $1', [id]);
  const guessHash = sha256(code);
  if (guessHash.length !== codeHash.length || !timingSafeEqual(guessHash, codeHash)) {
    return false;
  }
  await client.query('UPDATE one_time_codes SET used_at = $2 WHERE id = $1', [id, now]);
  return true;
}

export { verifyOneTimeCode };
