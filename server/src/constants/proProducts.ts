// The two Pro products (spec "2. Pro"): an auto-renewing annual subscription, whose entitlement row
// carries expires_at, and a lifetime non-consumable, whose row never expires. Both fit the app's
// PRODUCT_ID_PATTERN. The webhook, hasPro, the profile, and the admin toggle match these exactly.
// RevenueCat reports a Google Play subscription as `<subscription id>:<base plan id>` (the annual
// arrives as `syntactical.pro.annual:yearly`), so the webhook normalises an id before matching it.
const PRO_PRODUCT_IDS = {
  ANNUAL: 'syntactical.pro.annual',
  LIFETIME: 'syntactical.pro.lifetime',
} as const;

const PRO_PRODUCT_ID_LIST = [PRO_PRODUCT_IDS.ANNUAL, PRO_PRODUCT_IDS.LIFETIME] as const;

// Exactly one colon, a store id before it and a base plan id after it. Anything else is left as is.
const PLAY_BASE_PLAN_ID_PATTERN = /^[a-z0-9.]+:[a-z0-9-]+$/;

type ProProductId = (typeof PRO_PRODUCT_ID_LIST)[number];

// How each Pro product treats the events that end or extend access. The only place these
// per-product rules live: recomputeEntitlement and recordPurchaseEvent read them.
interface ProProductRule {
  // What a CANCELLATION does: 'expiry' only moves expires_at (auto-renew off, access continues to
  // the period end); 'revoke' ends access.
  cancellation: 'expiry' | 'revoke';
  // Whether a grant counts only when it carries expiration_at_ms. Fail closed: a period product
  // must never become Pro forever.
  requiresExpiry: boolean;
}

const PRO_PRODUCT_RULES: Readonly<Record<ProProductId, ProProductRule>> = {
  [PRO_PRODUCT_IDS.ANNUAL]: { cancellation: 'expiry', requiresExpiry: true },
  [PRO_PRODUCT_IDS.LIFETIME]: { cancellation: 'revoke', requiresExpiry: false },
};

// RevenueCat reports a store refund as a CANCELLATION with this cancel_reason. It revokes either
// product, whatever the product's cancellation rule.
const PRO_REFUND_CANCEL_REASON = 'CUSTOMER_SUPPORT';

function isProProductId(productId: string): productId is ProProductId {
  return (PRO_PRODUCT_ID_LIST as readonly string[]).includes(productId);
}

// The subscription id of a Play `<subscription id>:<base plan id>`; any other id unchanged.
function normalizeProductId(productId: string): string {
  if (!PLAY_BASE_PLAN_ID_PATTERN.test(productId)) {
    return productId;
  }
  return productId.slice(0, productId.indexOf(':'));
}

export {
  isProProductId,
  normalizeProductId,
  PRO_PRODUCT_ID_LIST,
  PRO_PRODUCT_IDS,
  PRO_PRODUCT_RULES,
  PRO_REFUND_CANCEL_REASON,
};
export type { ProProductId, ProProductRule };
