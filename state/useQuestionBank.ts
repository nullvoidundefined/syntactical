// One bank's load state. A local copy (cached or bundled) whose hash
// matches the manifest is used directly; otherwise the bank downloads,
// keyed by its hash so overlapping requests share one fetch. A paid bank's
// shared or bundled copy plays only for a signed-in owner holding its
// entitlement, and the owner's own cache (read even offline) also counts as a
// local copy. It downloads only for an entitled owner; without one it is
// locked (loading while entitlements load) and no request is made.
import { buildBankContext } from '@syntactical/content-schema';
import type { BankEntry, CachedBank, Manifest } from '@syntactical/content-schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { buildBankQuery } from '../services/content/buildBankQuery';
import { findBankEntry } from '../services/content/findBankEntry';
import { readCachedBank } from '../services/content/readCachedBank';

import { useSignedInUserId } from './AuthProvider';
import { useContentContext } from './ContentProvider';
import { useEntitlements, type EntitlementsState } from './useEntitlements';
import { useLanguageManifest } from './useLanguageManifest';

export type QuestionBankState =
  | { bank: CachedBank; status: 'ready' }
  | { status: 'loading' }
  | { status: 'locked' }
  | { retry: () => void; status: 'error' }
  | { status: 'unknown' };

const PLACEHOLDER_ENTRY: BankEntry = {
  access: 'free',
  contentVersion: 0,
  hash: 'none',
  path: '',
  topicCounts: {},
};

function readOwnedBank(manifest: Manifest, language: string, difficulty: string, ownerUserId: string) {
  const languageEntry = manifest.languages.find(({ id }) => id === language);
  if (!languageEntry) return Promise.resolve(null);
  return readCachedBank(language, difficulty, buildBankContext(languageEntry), ownerUserId);
}

// The local copy to play: one matching the manifest hash when any does, else
// the first one present (played while a newer copy downloads).
function pickLocalBank(candidates: Array<CachedBank | null | undefined>, hash: string | undefined): CachedBank | null {
  const present = candidates.filter((bank): bank is CachedBank => Boolean(bank));
  return present.find((bank) => bank.hash === hash) ?? present[0] ?? null;
}

function isEntitled(entitlements: EntitlementsState, productId: string | undefined): boolean {
  return entitlements.status === 'ready' && productId !== undefined && entitlements.productIds.has(productId);
}

function describeMissingPaidBank(ownerUserId: string | null, entitlements: EntitlementsState): QuestionBankState {
  if (ownerUserId === null) return { status: 'locked' };
  if ('retry' in entitlements) return entitlements;
  if (entitlements.status === 'loading') return { status: 'loading' };
  return { status: 'locked' };
}

export function useQuestionBank(language: string, difficulty: string): QuestionBankState {
  const queryClient = useQueryClient();
  const access = useContentContext();
  const manifest = useLanguageManifest();
  const ownerUserId = useSignedInUserId();
  const entitlements = useEntitlements();
  const entry = findBankEntry(manifest, language, difficulty);
  const { access: bankAccess, hash, productId } = entry ?? {};
  const isPaid = bankAccess === 'paid';
  const ownedQuery = useQuery({
    enabled: isPaid && ownerUserId !== null,
    networkMode: 'always',
    queryFn: () => readOwnedBank(manifest, language, difficulty, ownerUserId ?? ''),
    queryKey: ['ownedBank', ownerUserId, language, difficulty],
  });
  const { data: ownedBank, isPending: isOwnedQueryPending } = ownedQuery;
  const isOwnedPending = isPaid && ownerUserId !== null && isOwnedQueryPending;
  const sharedBank = access.readLocalBank(language, difficulty);
  const isPaidEntitled = isPaid && isEntitled(entitlements, productId);
  // A paid bank plays an older copy only from the owner's own cache; a shared or
  // bundled copy counts only when it is current and the owner is entitled.
  const localBank = isPaid
    ? pickLocalBank([isPaidEntitled && sharedBank?.hash === hash ? sharedBank : null, ownedBank], hash)
    : sharedBank;
  const needsDownload = entry !== undefined && localBank?.hash !== hash;
  const canDownload = isPaid ? isPaidEntitled : access.contentBaseUrl !== null;
  const query = useQuery({
    ...buildBankQuery(queryClient, access, language, difficulty, entry ?? PLACEHOLDER_ENTRY, isPaid ? ownerUserId : null),
    enabled: needsDownload && canDownload && !isOwnedPending,
  });
  const { data, isError } = query;
  if (!entry) return { status: 'unknown' };
  if (needsDownload && data) return { bank: data, status: 'ready' };
  if (localBank) return { bank: localBank, status: 'ready' };
  if (isOwnedPending) return { status: 'loading' };
  if (isPaid && !canDownload) return describeMissingPaidBank(ownerUserId, entitlements);
  if (isError) return { retry: () => void query.refetch(), status: 'error' };
  return { status: 'loading' };
}
