// Checks a password for sign-in (B-68, B-77, B-79). The user is read by normalized email with an
// autocommit query, so no pooled client or row lock is held while a derivation waits for a slot or
// runs. The password is verified against the stored hash, or against the dummy hash when there is
// none the parser accepts (unknown email, code-only account, a bad string), so every call runs
// exactly one derivation. A rehash is derived only after a success on old parameters. Every
// derivation runs inside a slot, and a slot that does not free rejects with HashSlotsBusy.
// Nothing here logs or returns the password or a hash other than the one that verified.
import type { Database } from '../clients/database.js';
import type { PasswordHashSlots } from '../routes/authDeps.js';

import { hashPassword, isUsableHash, needsRehash, verifyPassword } from './passwordHash.js';
import type { DeriveKey } from './passwordHash.js';

interface VerifyUserPasswordInput {
  deriveKey?: DeriveKey;
  dummyHash: string;
  // Already normalized by the request schema.
  email: string;
  normalizedPassword: string;
  slots: PasswordHashSlots;
}

interface VerifiedUserPassword {
  // The new hash to store, present only when the verified hash used old parameters.
  rehash?: string;
  userId: string;
  verifiedHash: string;
}

async function verifyUserPassword(
  database: Database,
  input: VerifyUserPasswordInput,
): Promise<VerifiedUserPassword | null> {
  const { deriveKey, dummyHash, email, normalizedPassword, slots } = input;
  const deps = deriveKey ? { deriveKey } : {};
  const { rows } = await database.query<{ id: string; password_hash: string | null }>(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  const stored = user?.password_hash;
  const isStoredUsable = stored != null && isUsableHash(stored);
  const storedHash = isStoredUsable ? stored : dummyHash;
  const isVerified = await slots.run(() => verifyPassword(normalizedPassword, storedHash, deps));
  if (!user || !isStoredUsable || !isVerified) {
    return null;
  }
  const verified: VerifiedUserPassword = { userId: user.id, verifiedHash: storedHash };
  if (needsRehash(storedHash)) {
    verified.rehash = await slots.run(() => hashPassword(normalizedPassword, deps));
  }
  return verified;
}

export { verifyUserPassword };
export type { VerifiedUserPassword };
