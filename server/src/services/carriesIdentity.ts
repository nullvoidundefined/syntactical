// Whether one string carries the identity (B-59.1c): the user id anywhere inside it, the email only
// as a whole address (no local-part character before it, no domain continuation after it), checked
// on the normalized text; any one bounded occurrence is enough. Needles are already normalized.
import { normalizeEmail } from './normalizeEmail.js';
import type { PurchaseIdentity } from './purchaseIdentity.js';

const LOCAL_PART_CHARACTER = /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]/u;
const DOMAIN_CONTINUATION = /^(?:[\p{L}\p{N}-]|\.[\p{L}\p{N}])/u;

function isBoundedAt(text: string, start: number, length: number): boolean {
  const before = Array.from(text.slice(0, start)).pop();
  if (before !== undefined && LOCAL_PART_CHARACTER.test(before)) {
    return false;
  }
  return !DOMAIN_CONTINUATION.test(text.slice(start + length));
}

function containsWholeAddress(text: string, email: string): boolean {
  for (let start = text.indexOf(email); start !== -1; start = text.indexOf(email, start + 1)) {
    if (isBoundedAt(text, start, email.length)) {
      return true;
    }
  }
  return false;
}

function carriesIdentity(text: string, needles: PurchaseIdentity): boolean {
  const { email, userId } = needles;
  const normalized = normalizeEmail(text);
  return normalized.includes(userId) || containsWholeAddress(normalized, email);
}

export { carriesIdentity };
