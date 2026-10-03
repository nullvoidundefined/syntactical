// Whether a purchase payload holds the email or id under the B-59.1c rule, in any string value or
// object key, without the PII-attribute clearing the scrub does. A container nested past the depth
// cap counts as carrying, since the scrub replaces it wholesale.
import { carriesIdentity } from './carriesIdentity.js';
import type { PurchaseIdentity } from './purchaseIdentity.js';
import { buildNeedles } from './purchaseNeedles.js';

const MAX_DEPTH = 64;

function holdsIdentity(node: unknown, needles: PurchaseIdentity, depth: number): boolean {
  if (typeof node === 'string') {
    return carriesIdentity(node, needles);
  }
  if (node === null || typeof node !== 'object') {
    return false;
  }
  if (depth > MAX_DEPTH) {
    return true;
  }
  if (Array.isArray(node)) {
    return node.some((item) => holdsIdentity(item, needles, depth + 1));
  }
  return Object.entries(node as Record<string, unknown>).some(
    ([key, value]) => carriesIdentity(key, needles) || holdsIdentity(value, needles, depth + 1),
  );
}

function carriesPurchaseIdentity(payload: unknown, identity: PurchaseIdentity): boolean {
  return holdsIdentity(payload, buildNeedles(identity), 1);
}

export { carriesPurchaseIdentity };
