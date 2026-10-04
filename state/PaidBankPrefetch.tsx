// Prefetches the signed-in owner's entitled paid banks in the background once
// their entitlements are known, so a purchased bank is ready to play offline.
// Renders nothing; a guest triggers no request.
import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { logWarning } from '../clients/logClient';
import { prefetchPaidBanks } from '../services/content/prefetchPaidBanks';

import { useSignedInUserId } from './AuthProvider';
import { useContentContext } from './ContentProvider';
import { useEntitlements } from './useEntitlements';
import { useLanguageManifest } from './useLanguageManifest';

export function PaidBankPrefetch() {
  const queryClient = useQueryClient();
  const access = useContentContext();
  const manifest = useLanguageManifest();
  const ownerUserId = useSignedInUserId();
  const entitlements = useEntitlements();
  const entitledProductIds = 'productIds' in entitlements ? entitlements.productIds : null;

  useEffect(() => {
    if (ownerUserId === null || entitledProductIds === null || entitledProductIds.size === 0) return;
    prefetchPaidBanks(queryClient, manifest, access, { entitledProductIds, ownerUserId }).catch((err: unknown) =>
      logWarning({ err }, 'paid bank prefetch failed'),
    );
  }, [access, entitledProductIds, manifest, ownerUserId, queryClient]);

  return null;
}
