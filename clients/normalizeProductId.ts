// A store product identifier as the app spells product ids. RevenueCat reports a Google Play
// subscription as <subscription id>:<base plan id> (syntactical.pro.annual:yearly); this returns
// the part before the colon. Any other string, a malformed a: or a:b:c included, comes back
// unchanged. The server normalizes webhook product ids with the same rule.
const BASE_PLAN_SUFFIXED_ID = /^[a-z0-9.]+:[a-z0-9-]+$/;

export function normalizeProductId(productId: string): string {
  if (!BASE_PLAN_SUFFIXED_ID.test(productId)) return productId;
  return productId.slice(0, productId.indexOf(':'));
}
