// Whether a purchase payload holds the email or id under the B-59.1c rule, in any string value or
// object key, without the PII-attribute clearing the scrub does. Derived from the scrubber's own
// walker (match-only mode, then compare), so row selection and scrubbing share one walk and one
// depth cap; a container nested past the cap is replaced wholesale and so counts as carrying.
import type { PurchaseIdentity } from './purchaseIdentity.js';
import { scrubPurchasePayload } from './scrubPurchasePayload.js';

function carriesPurchaseIdentity(payload: unknown, identity: PurchaseIdentity): boolean {
  const matchOnly = scrubPurchasePayload(payload, identity, {
    clearPiiAttributes: false,
  });
  return JSON.stringify(matchOnly) !== JSON.stringify(payload);
}

export { carriesPurchaseIdentity };
