// The normalized email and user id a purchase payload is matched against (B-59.1c): each is trimmed,
// NFKC-normalized, and lowercased, and a blank value throws.
import { normalizeEmail } from './normalizeEmail.js';
import type { PurchaseIdentity } from './purchaseIdentity.js';

function buildNeedles(identity: PurchaseIdentity): PurchaseIdentity {
  const { email, userId } = identity;
  const needles = {
    email: normalizeEmail(email),
    userId: normalizeEmail(userId),
  };
  const { email: needleEmail, userId: needleUserId } = needles;
  if (needleEmail === '' || needleUserId === '') {
    throw new Error('scrubPurchasePayload requires a non-blank email and userId');
  }
  return needles;
}

export { buildNeedles };
