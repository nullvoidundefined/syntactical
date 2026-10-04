// Buying a paid bank and restoring purchases. The store call only starts the
// purchase; a bank unlocks solely when GET /me lists its entitlement, so every
// success path refetches /me through the entitlements query. Store prices load
// only on request and only for a signed-in user (the SDKs are identified then).
import { useCallback, useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { trackEvent } from '../clients/analyticsClient';
import {
    buyStoreProduct,
    readStorePrices,
    restoreStorePurchases,
} from '../clients/purchaseStoreClient';

import { useSignedInUserId } from './AuthProvider';
import { buildEntitlementsKey, fetchEntitlements } from './useEntitlements';

// unlocked: /me lists the product. redirect: web checkout finished, the
// purchase-complete route confirms it. pending: the store finished but /me does
// not list the product yet. cancelled and unavailable: nothing was bought.
export type BuyOutcome = 'cancelled' | 'pending' | 'redirect' | 'unavailable' | 'unlocked';

export type PurchasesState = {
    buy: (productId: string) => Promise<BuyOutcome>;
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

    const buy = useCallback(
        async (productId: string): Promise<BuyOutcome> => {
            const outcome = await buyStoreProduct(productId);
            if (outcome !== 'purchased') return outcome;
            if (Platform.OS === 'web') return 'redirect';
            const entitlements = await refetchEntitlements();
            if (entitlements?.includes(productId)) {
                trackEvent('purchase_completed', { productId });
                return 'unlocked';
            }
            return 'pending';
        },
        [refetchEntitlements],
    );

    const restore = useCallback(async (): Promise<boolean> => {
        if (!(await restoreStorePurchases())) return false;
        return (await refetchEntitlements()) !== null;
    }, [refetchEntitlements]);

    return { buy, prices: userId === null ? NO_PRICES : prices, restore };
}
