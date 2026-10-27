// The admin's own Pro grant: GET admin/access reads the one entry, and setAccess sends PUT
// admin/access { isGranted }. The entry changes only from the server's reply to a PUT, so a refused
// or failed change leaves the switch where it was. A change refreshes the 'me' queries, so
// useProStatus follows without a reload. Only a 401 or 403 means the page is not available to this
// account; any other failed load can be retried.
import { useCallback, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, apiPut } from '../clients/apiClient';
import { HTTP_STATUS_FORBIDDEN, HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../constants/appConfig';
import { parseAccessEntry, type AccessEntry } from '../services/admin/parseAccessEntry';

import { useSignedInUserId } from './AuthProvider';

export type AdminAccessState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { retry: () => void; status: 'failed' }
  | { entry: AccessEntry; status: 'ready' };

const ACCESS_PATH = 'admin/access';

class AccessRefused extends Error {}

function readEntry(body: unknown): AccessEntry | null {
  return parseAccessEntry((body as { data?: unknown } | null)?.data);
}

async function fetchAccessEntry(): Promise<AccessEntry> {
  const { body, status } = await apiFetch(ACCESS_PATH);
  if (status === HTTP_STATUS_UNAUTHORIZED || status === HTTP_STATUS_FORBIDDEN) {
    throw new AccessRefused(`admin access request answered ${status}`);
  }
  const entry = status === HTTP_STATUS_OK ? readEntry(body) : null;
  if (entry === null) throw new Error(`admin access request answered ${status}`);
  return entry;
}

export function buildAdminAccessKey(userId: string | null) {
  return ['admin', 'access', userId] as const;
}

export function useAdminAccess() {
  const userId = useSignedInUserId();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  const { data, error, isError, refetch } = useQuery({
    enabled: userId !== null,
    queryFn: fetchAccessEntry,
    queryKey: buildAdminAccessKey(userId),
    refetchOnMount: 'always',
  });

  const setAccess = useCallback(
    async (isGranted: boolean): Promise<void> => {
      setIsFailed(false);
      setIsPending(true);
      try {
        const { body, status } = await apiPut(ACCESS_PATH, { isGranted });
        const entry = status === HTTP_STATUS_OK ? readEntry(body) : null;
        if (entry === null) throw new Error(`admin access update answered ${status}`);
        queryClient.setQueryData<AccessEntry>(buildAdminAccessKey(userId), entry);
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      } catch {
        setIsFailed(true);
      } finally {
        setIsPending(false);
      }
    },
    [queryClient, userId],
  );

  let state: AdminAccessState = { status: 'loading' };
  const isRefused = isError && error instanceof AccessRefused;
  if (userId === null || isRefused) state = { status: 'unavailable' };
  else if (data !== undefined) state = { entry: data, status: 'ready' };
  else if (isError) state = { retry: () => void refetch(), status: 'failed' };
  return { isFailed, isPending, setAccess, state };
}
