// Issues a one-time sign-in code (B-25): draws 6 digits from the injected randomInt
// (crypto.randomInt in production), invalidates the email's earlier unused codes, stores only
// the code's SHA-256 with a 10-minute expiry, and emails the code. The email is sent inside
// the transaction, so a failed send rolls the new row back and leaves no usable code. A
// transaction-scoped advisory lock on the email serializes concurrent issues for it.
import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { AUTH } from '../constants/auth.js';

import { sha256 } from './sha256.js';

const {
  CODE: { DIGITS, TTL_MS, UPPER_BOUND },
} = AUTH;

// Marks a failed send, so the transaction rolls back and the caller can tell it apart.
class EmailSendFailure extends Error {}

interface IssueOneTimeCodeInput {
  database: Database;
  // Already normalized by the request schema.
  email: string;
  now: Date;
  randomInt: (min: number, max: number) => number;
  sendSignInCode: (email: string, code: string) => Promise<void>;
}

// Resolves false when the email could not be sent; nothing is stored or invalidated then.
async function issueOneTimeCode(input: IssueOneTimeCodeInput): Promise<boolean> {
  const { database, email, now, randomInt, sendSignInCode } = input;
  const code = String(randomInt(0, UPPER_BOUND)).padStart(DIGITS, '0');
  const expiresAt = new Date(now.getTime() + TTL_MS);
  try {
    await withTransaction(database, async (client) => {
      // Serializes issues for one email until commit: under READ COMMITTED two concurrent issues
      // would each find no committed live code to invalidate and both leave one live.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);
      await client.query(
        `UPDATE one_time_codes SET invalidated_at = $2
         WHERE email = $1 AND used_at IS NULL AND invalidated_at IS NULL`,
        [email, now],
      );
      await client.query(
        'INSERT INTO one_time_codes (email, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)',
        [email, sha256(code), expiresAt, now],
      );
      await sendSignInCode(email, code).catch(() => {
        throw new EmailSendFailure('sign-in email failed');
      });
    });
    return true;
  } catch (error) {
    if (error instanceof EmailSendFailure) {
      return false;
    }
    throw error;
  }
}

export { issueOneTimeCode };
