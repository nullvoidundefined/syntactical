// Whether the signed-in user may ask about a question: the server allows it to anyone holding any
// granted entitlement, so the ask box shows once the entitlements have loaded with at least one.
// A guest, a user still loading, or a failed load sees no ask box.
import { useEntitlements } from './useEntitlements';

export function useCanAsk(): boolean {
  const entitlements = useEntitlements();
  return entitlements.status === 'ready' && entitlements.productIds.size > 0;
}
