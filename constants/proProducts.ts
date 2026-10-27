// The two Pro products the stores sell and the plan each one is. A product id outside these is
// not Pro. The ids match PRODUCT_ID_PATTERN in constants/appConfig.ts.
export const PRO_PRODUCT_IDS = {
  ANNUAL: 'syntactical.pro.annual',
  LIFETIME: 'syntactical.pro.lifetime',
} as const;

export type ProPlan = 'annual' | 'lifetime';

export function readProPlan(productId: string): ProPlan | null {
  if (productId === PRO_PRODUCT_IDS.ANNUAL) return 'annual';
  if (productId === PRO_PRODUCT_IDS.LIFETIME) return 'lifetime';
  return null;
}

// Answers a day with Pro, as the Pro sheet names it. Must equal ASK.DAILY_LIMIT.PRO in
// server/src/constants/ask.ts; constants/__tests__/proAskLimitContract.test.ts fails otherwise.
export const PRO_DAILY_ASK_LIMIT = 20;
