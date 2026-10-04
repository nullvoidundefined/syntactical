// The signed-in user's entitlements (paid bank product ids) from GET /me, keyed
// by user id so one account's list never answers for another. A guest has none
// and makes no request.
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../clients/apiClient';
import { HTTP_STATUS_OK } from '../constants/appConfig';

import { useSignedInUserId } from './AuthProvider';

export type EntitlementsState =
    | { status: 'guest' }
    | { status: 'loading' }
    | { retry: () => void; status: 'error' }
    | { productIds: ReadonlySet<string>; status: 'ready' };

export async function fetchEntitlements(): Promise<string[]> {
    const { body, status } = await apiFetch('me');
    const entitlements = (body as { data?: { entitlements?: unknown } } | null)?.data?.entitlements;
    if (status !== HTTP_STATUS_OK || !Array.isArray(entitlements)) {
        throw new Error(`profile request failed with ${status}`);
    }
    return entitlements.filter((id): id is string => typeof id === 'string');
}

function toProductIdSet(ids: string[]): ReadonlySet<string> {
    return new Set(ids);
}

export function buildEntitlementsKey(userId: string | null) {
    return ['me', userId, 'entitlements'] as const;
}

export function useEntitlements(): EntitlementsState {
    const userId = useSignedInUserId();
    const query = useQuery({
        enabled: userId !== null,
        queryFn: fetchEntitlements,
        queryKey: buildEntitlementsKey(userId),
        select: toProductIdSet,
    });
    const { data, isError, refetch } = query;
    if (userId === null) return { status: 'guest' };
    if (data) return { productIds: data, status: 'ready' };
    if (isError) return { retry: () => void refetch(), status: 'error' };
    return { status: 'loading' };
}
