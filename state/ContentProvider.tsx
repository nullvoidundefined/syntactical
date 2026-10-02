// Reads the cached manifest and every cached bank once at startup, then
// renders the app. Rounds never wait on the network: whatever is cached,
// or bundled, is available as soon as this read completes. It then
// refreshes the manifest and prefetches every bank whose hash changed.
import { buildBankContext, validateQuestionBank } from '@syntactical/content-schema';
import type { CachedBank, Manifest } from '@syntactical/content-schema';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { logWarning } from '../clients/logClient';
import { buildManifestQuery } from '../services/content/buildManifestQuery';
import { BUNDLED_BANKS } from '../services/content/bundledBanks.generated';
import { BUNDLED_MANIFEST } from '../services/content/bundledManifest.generated';
import { findBankEntry } from '../services/content/findBankEntry';
import { prefetchChangedBanks } from '../services/content/prefetchChangedBanks';
import { readCachedBank } from '../services/content/readCachedBank';
import { readCachedManifest } from '../services/content/readCachedManifest';
import type { ContentAccess } from '../services/content/types/ContentAccess';

type HydratedContent = { banks: Map<string, CachedBank>; manifest: Manifest };

const ContentContext = createContext<ContentAccess | null>(null);
const BUNDLED = BUNDLED_MANIFEST;

function buildBankId(language: string, difficulty: string): string {
  return `${language}/${difficulty}`;
}

function readBundledBank(language: string, difficulty: string): CachedBank | null {
  const entry = findBankEntry(BUNDLED, language, difficulty);
  const languageEntry = BUNDLED.languages.find(({ id }) => id === language);
  if (!entry || !languageEntry) return null;
  const result = validateQuestionBank(BUNDLED_BANKS[buildBankId(language, difficulty)], buildBankContext(languageEntry));
  if (!result.isValid) return null;
  const { questions } = result;
  return { hash: entry.hash, questions };
}

// Cached banks are validated against the baseline (cached or bundled) manifest's
// topics and misconceptions; a bank cached under a newer manifest whose cache is
// gone may drop questions and fall back to the bundled bank, never crash.
async function readAllCachedBanks(manifest: Manifest): Promise<Map<string, CachedBank>> {
  const slots = manifest.languages.flatMap((languageEntry) =>
    Object.keys(languageEntry.banks).map((difficulty) => ({ difficulty, language: languageEntry.id, languageEntry })),
  );
  const banks = await Promise.all(
    slots.map(({ language, difficulty, languageEntry }) =>
      readCachedBank(language, difficulty, buildBankContext(languageEntry)),
    ),
  );
  const cachedBanks = new Map<string, CachedBank>();
  slots.forEach(({ language, difficulty }, index) => {
    const bank = banks[index];
    if (bank) cachedBanks.set(buildBankId(language, difficulty), bank);
  });
  return cachedBanks;
}

async function hydrateContent(): Promise<HydratedContent> {
  const manifest = (await readCachedManifest()) ?? BUNDLED;
  return { banks: await readAllCachedBanks(manifest), manifest };
}

function buildContentAccess(hydrated: HydratedContent, contentBaseUrl: string | null): ContentAccess {
  const { banks, manifest } = hydrated;
  return {
    baselineManifest: manifest,
    contentBaseUrl,
    readLocalBank: (language, difficulty) =>
      banks.get(buildBankId(language, difficulty)) ?? readBundledBank(language, difficulty),
  };
}

export function ContentProvider({
  contentBaseUrl,
  children,
}: {
  contentBaseUrl: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState<HydratedContent | null>(null);

  useEffect(() => {
    hydrateContent()
      .catch((err: unknown) => {
        logWarning({ err }, 'content hydration failed');
        return { banks: new Map<string, CachedBank>(), manifest: BUNDLED };
      })
      .then(setHydrated);
  }, []);

  const access = useMemo(
    () => (hydrated ? buildContentAccess(hydrated, contentBaseUrl) : null),
    [hydrated, contentBaseUrl],
  );

  const { data: fetchedManifest } = useQuery(buildManifestQuery(contentBaseUrl, access !== null));

  useEffect(() => {
    if (access && fetchedManifest) prefetchChangedBanks(queryClient, fetchedManifest, access);
  }, [access, fetchedManifest, queryClient]);

  if (!access) return null;
  return <ContentContext.Provider value={access}>{children}</ContentContext.Provider>;
}

export function useContentContext(): ContentAccess {
  const access = useContext(ContentContext);
  if (!access) throw new Error('useContentContext must be used inside ContentProvider');
  return access;
}
