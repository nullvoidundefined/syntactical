// The page where the signed-in user manages their subscription, as RevenueCat reports it
// (CustomerInfo.managementURL: the App Store, Google Play, or Web Billing). Read only while the
// caller enables it (a Pro row), keyed by user id under 'me' so an admin change refetches it; null
// while loading, when RevenueCat reports none, or when the read fails. A failed read leaves the
// query in its error state with no data, so the next mount of the row reads it again.
import { useQuery } from '@tanstack/react-query';

import { readManagementUrl } from '../clients/purchaseStoreClient';

import { useSignedInUserId } from './AuthProvider';

export function buildManagementUrlKey(userId: string | null) {
  return ['me', userId, 'management-url'] as const;
}

export function useSubscriptionManagementUrl(isEnabled: boolean): string | null {
  const userId = useSignedInUserId();
  const { data } = useQuery({
    enabled: isEnabled && userId !== null,
    queryFn: readManagementUrl,
    queryKey: buildManagementUrlKey(userId),
  });
  return data ?? null;
}
