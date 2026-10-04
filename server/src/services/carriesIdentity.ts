// Whether one string carries the identity. Strict mode (B-59.1c, rows linked to another user): the user id anywhere
// inside it, the email only as a whole address (no letter, digit, `_`, `+`, `-`, `.`, or apostrophe before it, no
// domain continuation after it; B-59.9: the apostrophe is a local-part character, so a quote directly before the email
// keeps the row), checked on the normalized text; any one bounded occurrence is enough. The raw string and each of its
// percent-decoded forms (B-59.1e) are checked, and so are the percent-decoded forms of its NFKC-normalized text
// (B-59.10), so a fullwidth escape such as `％40` matches. Loose mode (B-59.7, the deleted user's own and unlinked
// rows): the email or the id anywhere in the normalized text, no boundary rule. Needles are already normalized.
import { normalizeEmail } from './normalizeEmail.js';
import { percentDecodeForms } from './percentDecodeForms.js';
import type { PurchaseIdentity } from './purchaseIdentity.js';

const LOCAL_PART_CHARACTER = /[\p{L}\p{N}_+.'-]/u;
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

interface CarriesOptions {
  isLoose?: boolean;
}

function carriesIdentityAsIs(text: string, { email, userId }: PurchaseIdentity, isLoose: boolean): boolean {
  const normalized = normalizeEmail(text);
  if (normalized.includes(userId)) {
    return true;
  }
  return isLoose ? normalized.includes(email) : containsWholeAddress(normalized, email);
}

function carriesIdentity(text: string, needles: PurchaseIdentity, { isLoose = false }: CarriesOptions = {}): boolean {
  if (carriesIdentityAsIs(text, needles, isLoose)) {
    return true;
  }
  const forms = new Set([...percentDecodeForms(text), ...percentDecodeForms(normalizeEmail(text))]);
  return Array.from(forms).some((form) => carriesIdentityAsIs(form, needles, isLoose));
}

export { carriesIdentity };
