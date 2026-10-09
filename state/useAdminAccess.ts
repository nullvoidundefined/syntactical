// The admin's paid bank access: GET admin/access lists every product, and setAccess sends
// PUT admin/access for one. The list changes only from the server's reply to a PUT, so a refused
// or failed change leaves the switch where it was. A change refreshes the 'me' queries so the
// entitlements behind the paid bank locks follow without a reload. Only a 401 or 403 means the
// page is not available to this account; any other failed load can be retried.
import { useCallback, useRef, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, apiPut } from '../clients/apiClient';
import { HTTP_STATUS_FORBIDDEN, HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../constants/appConfig';
import { parseAccessEntry, parseAccessList, type AccessEntry } from '../services/admin/parseAccessEntry';

import { useSignedInUserId } from './AuthProvider';

export type AdminAccessState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { retry: () => void; status: 'failed' }
  | { products: AccessEntry[]; status: 'ready' };

const ACCESS_PATH = 'admin/access';

class AccessListRefused extends Error {}

async function fetchAccessList(): Promise<AccessEntry[]> {
  const { body, status } = await apiFetch(ACCESS_PATH);
  if (status === HTTP_STATUS_UNAUTHORIZED || status === HTTP_STATUS_FORBIDDEN) {
    throw new AccessListRefused(`admin access request answered ${status}`);
  }
  const products = status === HTTP_STATUS_OK ? parseAccessList(body) : null;
  if (products === null) throw new Error(`admin access request answered ${status}`);
  return dedupeById(products);
}

// A repeated product id keeps its first entry, so each switch has one key and one cache row.
function dedupeById(products: AccessEntry[]): AccessEntry[] {
  const seen = new Set<string>();
  return products.filter(({ productId }) => {
    if (seen.has(productId)) return false;
    seen.add(productId);
    return true;
  });
}

export function useAdminAccess() {
  const userId = useSignedInUserId();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const pendingCount = useRef(0);
  const [isFailed, setIsFailed] = useState(false);

  const { data, error, isError, refetch } = useQuery({
    enabled: userId !== null,
    queryFn: fetchAccessList,
    queryKey: ['admin', 'access', userId],
    refetchOnMount: 'always',
  });

  const setAccess = useCallback(
    async (productId: string, isGranted: boolean): Promise<void> => {
      // An alert from an earlier failed change stays while another change is still in flight.
      if (pendingCount.current === 0) setIsFailed(false);
      pendingCount.current += 1;
      setPendingIds((ids) => new Set(ids).add(productId));
      try {
        const { body, status } = await apiPut(ACCESS_PATH, { isGranted, productId });
        const entry = status === HTTP_STATUS_OK ? parseAccessEntry((body as { data?: unknown } | null)?.data) : null;
        if (entry === null || entry.productId !== productId) throw new Error(`admin access update answered ${status}`);
        queryClient.setQueryData<AccessEntry[]>(['admin', 'access', userId], (list) =>
          list?.map((item) => (item.productId === productId ? entry : item)),
        );
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      } catch {
        setIsFailed(true);
      } finally {
        pendingCount.current -= 1;
        setPendingIds((ids) => {
          const next = new Set(ids);
          next.delete(productId);
          return next;
        });
      }
    },
    [queryClient, userId],
  );

  let state: AdminAccessState = { status: 'loading' };
  const isRefused = isError && error instanceof AccessListRefused;
  if (userId === null || isRefused) state = { status: 'unavailable' };
  else if (data !== undefined) state = { products: data, status: 'ready' };
  else if (isError) state = { retry: () => void refetch(), status: 'failed' };
  return { isFailed, pendingIds, setAccess, state };
}
