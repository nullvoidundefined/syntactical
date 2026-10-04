// The background prefetch of paid banks for a signed-in owner: downloads each
// paid bank the owner holds an entitlement for whose hash differs from both the
// owner's cached copy and any bundled copy. A bank without an entitlement is
// never requested.
import { buildBankContext } from '@syntactical/content-schema';
import type { Manifest } from '@syntactical/content-schema';
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../../clients/logClient';

import { buildBankQuery } from './buildBankQuery';
import { readCachedBank } from './readCachedBank';
import type { ContentAccess } from './types/ContentAccess';

type PaidBankOwner = { entitledProductIds: ReadonlySet<string>; ownerUserId: string };

export async function prefetchPaidBanks(
  queryClient: QueryClient,
  manifest: Manifest,
  access: ContentAccess,
  owner: PaidBankOwner,
): Promise<void> {
  const { entitledProductIds, ownerUserId } = owner;
  for (const language of manifest.languages) {
    const { banks, id } = language;
    for (const [difficulty, entry] of Object.entries(banks)) {
      if (!entry) continue;
      const { access: bankAccess, hash, path, productId } = entry;
      if (bankAccess !== 'paid' || !productId || !entitledProductIds.has(productId)) continue;
      if (access.readLocalBank(id, difficulty)?.hash === hash) continue;
      const owned = await readCachedBank(id, difficulty, buildBankContext(language), ownerUserId);
      if (owned?.hash === hash) continue;
      queryClient
        .prefetchQuery(buildBankQuery(queryClient, access, id, difficulty, entry, ownerUserId))
        .catch((err: unknown) => logWarning({ document: path, err }, 'paid bank prefetch failed'));
    }
  }
}
