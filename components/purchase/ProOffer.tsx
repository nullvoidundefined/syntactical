// The Pro sheet wired to the stores: it loads the store's prices and runs a purchase from the
// sheet. A native purchase closes the sheet once GET /me says Pro; one the store finished while
// /me does not say Pro yet says it is still processing and is re-checked twice, two seconds
// apart, while mounted; a failed purchase says so and a cancelled one says nothing. A web purchase
// goes to /purchase-complete for that product, where checkout's return is confirmed. The sheet
// cannot be closed while a purchase runs. A guest sees nothing, and signing out closes it. onClose
// names why: unlocked once GET /me says Pro, closed otherwise (a web checkout's return is
// confirmed by /purchase-complete, so it closes as closed).
import { useCallback, useEffect, useRef, useState } from 'react';

import { router } from 'expo-router';

import { useSignedInUserId } from '../../state/AuthProvider';
import { usePurchases } from '../../state/usePurchases';
import { PRO_RECHECK_COUNT, waitForProRecheck } from '../../state/waitForProRecheck';

import { ProSheet, type ProSheetSource } from './ProSheet';

const PURCHASE_FAILED = 'The purchase did not go through. Try again.';
const PURCHASE_PENDING = 'Your purchase is still processing. Check back shortly.';

export type ProOfferCloseReason = 'closed' | 'unlocked';

type ProOfferProps = { onClose: (reason: ProOfferCloseReason) => void; source: ProSheetSource };

export function ProOffer({ onClose, source }: ProOfferProps) {
  const userId = useSignedInUserId();
  const { buy, confirm, prices } = usePurchases({ shouldLoadPrices: true });
  const [isBuying, setIsBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // With nobody signed in there is no account to buy for.
  useEffect(() => {
    if (userId === null) onClose('closed');
  }, [onClose, userId]);

  const close = useCallback(() => {
    if (!isBuying) onClose('closed');
  }, [isBuying, onClose]);

  async function recheckPending(productId: string) {
    for (let attempt = 0; attempt < PRO_RECHECK_COUNT; attempt += 1) {
      await waitForProRecheck();
      if (!isMountedRef.current) return;
      if (await confirm(productId)) {
        if (isMountedRef.current) onClose('unlocked');
        return;
      }
    }
  }

  async function buyProduct(productId: string) {
    setIsBuying(true);
    setMessage(null);
    try {
      const outcome = await buy(productId);
      if (!isMountedRef.current) return;
      if (outcome === 'redirect') router.push({ params: { product: productId }, pathname: '/purchase-complete' });
      if (outcome === 'unavailable') setMessage(PURCHASE_FAILED);
      if (outcome === 'pending') {
        setMessage(PURCHASE_PENDING);
        void recheckPending(productId);
      }
      if (outcome === 'redirect') onClose('closed');
      if (outcome === 'unlocked') onClose('unlocked');
    } finally {
      if (isMountedRef.current) setIsBuying(false);
    }
  }

  if (userId === null) return null;
  return (
    <ProSheet
      isBuying={isBuying}
      message={message}
      onBuy={(productId) => void buyProduct(productId)}
      onClose={close}
      prices={prices}
      source={source}
    />
  );
}
