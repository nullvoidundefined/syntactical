// Purchase-complete route: where Web Billing checkout returns. It polls the
// profile until the product's entitlement appears or the deadline passes, and
// announces the outcome in a polite live region. A missing or invalid product,
// or a guest, makes no request, and nothing is decided until AuthProvider hydrates.
import { useEffect, useState } from 'react';

import { Link, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { apiFetch } from '../clients/apiClient';
import {
  HTTP_STATUS_OK,
  PRODUCT_ID_PATTERN,
  PURCHASE_POLL_DEADLINE_MS,
  PURCHASE_POLL_INTERVAL_MS,
} from '../constants/appConfig';
import { useAuth } from '../state/AuthProvider';

type PurchaseStatus = 'confirming' | 'unlocked' | 'timed-out';

const STATUS_MESSAGES: Record<PurchaseStatus, string> = {
  confirming: 'Confirming your purchase',
  'timed-out': 'Still processing, check back shortly',
  unlocked: 'Unlocked',
};

// The product id from the query string, or null when absent, repeated, or malformed.
function readProductId(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && PRODUCT_ID_PATTERN.test(value) ? value : null;
}

// True when a profile response lists the product among its entitlements.
function hasEntitlement({ body, status }: { status: number; body: unknown }, productId: string): boolean {
  if (status !== HTTP_STATUS_OK) return false;
  const data = (body as { data?: { entitlements?: unknown } } | null)?.data;
  return Array.isArray(data?.entitlements) && data.entitlements.includes(productId);
}

export default function PurchaseCompleteScreen() {
  const { product } = useLocalSearchParams<{ product?: string | string[] }>();
  const { isHydrated, isSignedIn } = useAuth();
  const productId = readProductId(product);
  const canPoll = productId !== null && isHydrated && isSignedIn;
  const [status, setStatus] = useState<PurchaseStatus>('confirming');

  useEffect(() => {
    if (!canPoll) return undefined;
    let isDecided = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus('confirming');

    function decide(outcome: PurchaseStatus) {
      isDecided = true;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
      setStatus(outcome);
    }

    async function poll() {
      let isUnlocked = false;
      try {
        isUnlocked = hasEntitlement(await apiFetch('me'), productId as string);
      } catch {
        // A failed request is retried at the next interval until the deadline.
      }
      if (isDecided) return;
      if (isUnlocked) {
        decide('unlocked');
        return;
      }
      pollTimer = setTimeout(() => void poll(), PURCHASE_POLL_INTERVAL_MS);
    }

    const deadlineTimer = setTimeout(() => decide('timed-out'), PURCHASE_POLL_DEADLINE_MS);
    void poll();
    return () => {
      isDecided = true;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
    };
  }, [canPoll, productId]);

  // Before hydration the identity is unknown, so the route waits instead of calling it a guest.
  const isWaiting = productId !== null && !isHydrated;
  const shownStatus: PurchaseStatus = isWaiting || canPoll ? status : 'timed-out';

  return (
    <View className="flex-1 items-center justify-center bg-obsidian px-4">
      <Text role="heading" aria-level={1} className="font-mono text-2xl text-ink">
        Purchase
      </Text>
      <View accessibilityLiveRegion="polite" role="status" className="mt-4">
        <Text className="font-mono text-sm text-ink">{STATUS_MESSAGES[shownStatus]}</Text>
      </View>
      <Link href="/" role="link" className="mt-4 font-mono text-sm text-signal">
        Back to menu
      </Link>
    </View>
  );
}
