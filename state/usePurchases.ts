// Buying a paid bank and restoring purchases. The store call only starts the
// purchase; a bank unlocks solely when GET /me lists its entitlement, so every
// success path refetches /me through the entitlements query. Store prices load
// only on request and only for a signed-in user (the SDKs are identified then).
import { useCallback, useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { trackEvent } from '../clients/analyticsClient';
import { buyStoreProduct, readStorePrices, restoreStorePurchases } from '../clients/purchaseStoreClient';

import { useSignedInUserId } from './AuthProvider';
import { buildEntitlementsKey, fetchEntitlements } from './useEntitlements';

// unlocked: /me lists the product. redirect: web checkout finished, the
// purchase-complete route confirms it. pending: the store finished but /me does
// not list the product yet. cancelled and unavailable: nothing was bought.
export type BuyOutcome = 'cancelled' | 'pending' | 'redirect' | 'unavailable' | 'unlocked';

// A caller that gives up while GET /me is pending (the purchase-complete route
// unmounting) aborts the signal; the refetch still lands in the cache, but the
// result reads as not confirmed and no event is recorded.
export type ConfirmOptions = { signal?: AbortSignal };

export type PurchasesState = {
  buy: (productId: string) => Promise<BuyOutcome>;
  confirm: (productId: string, options?: ConfirmOptions) => Promise<boolean>;
  prices: Readonly<Record<string, string>>;
  restore: () => Promise<boolean>;
};

const NO_PRICES: Readonly<Record<string, string>> = {};

export function usePurchases({ shouldLoadPrices = false } = {}): PurchasesState {
  const queryClient = useQueryClient();
  const userId = useSignedInUserId();
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!shouldLoadPrices || userId === null) return undefined;
    let isCurrent = true;
    void readStorePrices().then((found) => {
      if (isCurrent) setPrices(found);
    });
    return () => {
      isCurrent = false;
    };
  }, [shouldLoadPrices, userId]);

  // The server's entitlements after a fresh GET /me, or null when it fails.
  const refetchEntitlements = useCallback(async (): Promise<string[] | null> => {
    try {
      return await queryClient.fetchQuery({
        queryFn: fetchEntitlements,
        queryKey: buildEntitlementsKey(userId),
        staleTime: 0,
      });
    } catch {
      return null;
    }
  }, [queryClient, userId]);

  // Refetches GET /me; true (and records purchase_completed) when it lists the
  // product and the caller has not aborted meanwhile.
  const confirm = useCallback(
    async (productId: string, { signal }: ConfirmOptions = {}): Promise<boolean> => {
      const entitlements = await refetchEntitlements();
      if (signal?.aborted || !entitlements?.includes(productId)) return false;
      trackEvent('purchase_completed', { productId });
      return true;
    },
    [refetchEntitlements],
  );

  const buy = useCallback(
    async (productId: string): Promise<BuyOutcome> => {
      const outcome = await buyStoreProduct(productId);
      if (outcome !== 'purchased') return outcome;
      if (Platform.OS === 'web') return 'redirect';
      return (await confirm(productId)) ? 'unlocked' : 'pending';
    },
    [confirm],
  );

  const restore = useCallback(async (): Promise<boolean> => {
    if (!(await restoreStorePurchases())) return false;
    return (await refetchEntitlements()) !== null;
  }, [refetchEntitlements]);

  return { buy, confirm, prices: userId === null ? NO_PRICES : prices, restore };
}
