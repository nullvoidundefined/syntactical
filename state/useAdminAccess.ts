// The admin's paid bank access: GET admin/access lists every product, and setAccess sends
// PUT admin/access for one. The list changes only from the server's reply to a PUT, so a refused
// or failed change leaves the switch where it was. A change refreshes the 'me' queries so the
// entitlements behind the paid bank locks follow without a reload.
import { useCallback, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, apiPut } from '../clients/apiClient';
import { HTTP_STATUS_OK } from '../constants/appConfig';
import { parseAccessEntry, parseAccessList, type AccessEntry } from '../services/admin/parseAccessEntry';

import { useSignedInUserId } from './AuthProvider';

export type AdminAccessState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { products: AccessEntry[]; status: 'ready' };

const ACCESS_PATH = 'admin/access';

async function fetchAccessList(): Promise<AccessEntry[]> {
  const { body, status } = await apiFetch(ACCESS_PATH);
  const products = status === HTTP_STATUS_OK ? parseAccessList(body) : null;
  if (products === null) throw new Error(`admin access request answered ${status}`);
  return products;
}

export function useAdminAccess() {
  const userId = useSignedInUserId();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [isFailed, setIsFailed] = useState(false);

  const { data, isError } = useQuery({
    enabled: userId !== null,
    queryFn: fetchAccessList,
    queryKey: ['admin', 'access', userId],
  });

  const setAccess = useCallback(
    async (productId: string, isGranted: boolean): Promise<void> => {
      setIsFailed(false);
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
  if (userId === null || isError) state = { status: 'unavailable' };
  else if (data !== undefined) state = { products: data, status: 'ready' };
  return { isFailed, pendingIds, setAccess, state };
}
