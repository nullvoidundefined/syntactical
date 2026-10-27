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

// The subscription id of a Play `<subscription id>:<base plan id>`; any other id unchanged.
function normalizeProductId(productId: string): string {
  if (!PLAY_BASE_PLAN_ID_PATTERN.test(productId)) {
    return productId;
  }
  return productId.slice(0, productId.indexOf(':'));
}

export { normalizeProductId, PRO_PRODUCT_ID_LIST, PRO_PRODUCT_IDS };
export type { ProProductId };
