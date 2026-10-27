// Buying Pro and restoring purchases. The store call only starts the purchase; Pro shows solely
// when GET /me says pro.isActive, so every success path refetches /me through the Pro status
// query. Store prices load only on request and only for a signed-in user (the SDKs are
// identified then). The store is chosen per call by clients/selectPurchaseStoreClient.ts.
import { useCallback, useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { trackEvent } from '../clients/analyticsClient';
import { normalizeProductId } from '../clients/normalizeProductId';
import { selectPurchaseStoreClient } from '../clients/selectPurchaseStoreClient';
import { readProPlan } from '../constants/proProducts';

import { useSignedInUserId } from './AuthProvider';
import { buildProStatusKey, fetchProStatus, type ProStatus } from './useProStatus';

// unlocked: /me says Pro is active. redirect: web checkout finished, the
// purchase-complete route confirms it. pending: the store finished but /me does
// not say Pro yet. cancelled and unavailable: nothing was bought.
export type BuyOutcome = 'cancelled' | 'pending' | 'redirect' | 'unavailable' | 'unlocked';

// A caller that gives up while GET /me is pending (the purchase-complete route
// unmounting) aborts the signal; the refetch still lands in the cache, but the
// result reads as not confirmed and no event is recorded.
export type ConfirmOptions = { signal?: AbortSignal };

// restore resolves true only when GET /me says Pro after the store's restore, false when GET /me
// says this account is not Pro, and rejects when the store call or GET /me failed.
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
    void selectPurchaseStoreClient()
      .client.readStorePrices()
      .then((found) => {
        if (isCurrent) setPrices(found);
      });
    return () => {
      isCurrent = false;
    };
  }, [shouldLoadPrices, userId]);

  // The server's Pro status after a fresh GET /me, or null when it fails.
  const refetchProStatus = useCallback(async (): Promise<ProStatus | null> => {
    try {
      return await queryClient.fetchQuery({
        queryFn: fetchProStatus,
        queryKey: buildProStatusKey(userId),
        staleTime: 0,
      });
    } catch {
      return null;
    }
  }, [queryClient, userId]);

  // Refetches GET /me; true when it says Pro is active and the caller has not aborted meanwhile.
  // Then records purchase_completed with the product id and, for a Pro product (a Play base-plan
  // suffix stripped), pro_purchased with its plan.
  const confirm = useCallback(
    async (productId: string, { signal }: ConfirmOptions = {}): Promise<boolean> => {
      const pro = await refetchProStatus();
      if (signal?.aborted || pro?.isPro !== true) return false;
      trackEvent('purchase_completed', { productId });
      const plan = readProPlan(normalizeProductId(productId));
      if (plan !== null) trackEvent('pro_purchased', { product: plan });
      return true;
    },
    [refetchProStatus],
  );

  const buy = useCallback(
    async (productId: string): Promise<BuyOutcome> => {
      const { client, hasCheckoutRedirect } = selectPurchaseStoreClient();
      const outcome = await client.buyStoreProduct(productId, userId);
      if (outcome !== 'purchased') return outcome;
      if (hasCheckoutRedirect) return 'redirect';
      return (await confirm(productId)) ? 'unlocked' : 'pending';
    },
    [confirm, userId],
  );

  // True only when GET /me says Pro after the store restored, so a restore that found nothing for
  // this account never reads as restored. A failed store call or GET /me rejects instead of
  // resolving false, so Settings can tell "nothing to restore" from "try again".
  const restore = useCallback(async (): Promise<boolean> => {
    if (!(await selectPurchaseStoreClient().client.restoreStorePurchases())) throw new Error('store restore failed');
    const pro = await refetchProStatus();
    if (pro === null) throw new Error('profile request failed');
    return pro.isPro;
  }, [refetchProStatus]);

  return { buy, confirm, prices: userId === null ? NO_PRICES : prices, restore };
}
