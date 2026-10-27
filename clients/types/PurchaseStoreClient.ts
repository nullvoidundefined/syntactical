// What usePurchases needs from a store: localized prices by product id, a purchase that says only
// whether the store call finished (never whether Pro is active; GET /me says that), and a restore.
// appUserId is the signed-in user's server id; the real stores know it from the purchaser identity
// and ignore it, and the fixture store puts it in its synthetic webhook event.
import type { WebPurchaseOutcome } from './WebPurchaseOutcome';

export type PurchaseStoreClient = {
  buyStoreProduct: (productId: string, appUserId: string | null) => Promise<WebPurchaseOutcome>;
  readStorePrices: () => Promise<Record<string, string>>;
  restoreStorePurchases: () => Promise<boolean>;
};
