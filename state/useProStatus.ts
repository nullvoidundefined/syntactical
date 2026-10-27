// The signed-in user's Pro status from GET /me's data.pro, keyed by user id so one account's
// status never answers for another. A guest makes no request. The key sits under the 'me' root, so
// useAdminAccess's invalidation of ['me'] refetches it after an admin grant or revoke.
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../clients/apiClient';
import { HTTP_STATUS_OK } from '../constants/appConfig';
import type { ProPlan } from '../constants/proProducts';

import { useSignedInUserId } from './AuthProvider';

export type ProStatus = { expiresAt: string | null; isPro: boolean; product: ProPlan | null };

export type ProStatusState =
  | { status: 'guest' }
  | { status: 'loading' }
  | { retry: () => void; status: 'error' }
  | ({ status: 'ready' } & ProStatus);

function isExpiry(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

function isPlan(value: unknown): value is ProPlan | null {
  return value === null || value === 'annual' || value === 'lifetime';
}

// The pro object of a GET /me body, or null when it is missing or any field has the wrong shape.
function parseProStatus(body: unknown): ProStatus | null {
  const pro = (body as { data?: { pro?: unknown } } | null)?.data?.pro;
  if (typeof pro !== 'object' || pro === null) return null;
  const { expiresAt, isActive, product } = pro as Record<string, unknown>;
  if (typeof isActive !== 'boolean' || !isExpiry(expiresAt) || !isPlan(product)) return null;
  return { expiresAt, isPro: isActive, product };
}

export async function fetchProStatus(): Promise<ProStatus> {
  const { body, status } = await apiFetch('me');
  const pro = status === HTTP_STATUS_OK ? parseProStatus(body) : null;
  if (pro === null) throw new Error(`profile request failed with ${status}`);
  return pro;
}

export function buildProStatusKey(userId: string | null) {
  return ['me', userId, 'pro'] as const;
}

export function useProStatus(): ProStatusState {
  const userId = useSignedInUserId();
  const { data, isError, refetch } = useQuery({
    enabled: userId !== null,
    queryFn: fetchProStatus,
    queryKey: buildProStatusKey(userId),
  });
  if (userId === null) return { status: 'guest' };
  if (data) return { ...data, status: 'ready' };
  if (isError) return { retry: () => void refetch(), status: 'error' };
  return { status: 'loading' };
}
