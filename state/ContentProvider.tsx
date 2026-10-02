// Reads the cached manifest and every cached bank once at startup, then
// renders the app. Rounds never wait on the network: whatever is cached,
// or bundled, is available as soon as this read completes. It then
// refreshes the manifest and prefetches every bank whose hash changed.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { logWarning } from '../clients/logClient';
import {
  buildManifestQuery,
  findBankEntry,
  prefetchChangedBanks,
  type ContentAccess,
} from '../services/content/bankQueries';
import { BUNDLED_BANKS, BUNDLED_MANIFEST } from '../services/content/bundledContent.generated';
import {
  readCachedBank,
  readCachedManifest,
  type CachedBank,
} from '../services/content/contentCache';
import type { Manifest } from '../services/content/contentTypes';
import { validateQuestionBank } from '../services/content/validateQuestionBank';

type HydratedContent = { manifest: Manifest; banks: Map<string, CachedBank> };

const ContentContext = createContext<ContentAccess | null>(null);
const BUNDLED = BUNDLED_MANIFEST as unknown as Manifest;

function buildBankId(language: string, difficulty: string): string {
  return `${language}/${difficulty}`;
}

function readBundledBank(language: string, difficulty: string): CachedBank | null {
  const entry = findBankEntry(BUNDLED, language, difficulty);
  const result = validateQuestionBank(BUNDLED_BANKS[buildBankId(language, difficulty)]);
  return entry && result.isValid ? { hash: entry.hash, questions: result.questions } : null;
}

async function readAllCachedBanks(manifest: Manifest): Promise<Map<string, CachedBank>> {
  const slots = manifest.languages.flatMap((language) =>
    Object.keys(language.banks).map((difficulty) => ({ language: language.id, difficulty })),
  );
  const banks = await Promise.all(
    slots.map(({ language, difficulty }) => readCachedBank(language, difficulty)),
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
  return { manifest, banks: await readAllCachedBanks(manifest) };
}

function buildContentAccess(hydrated: HydratedContent, contentBaseUrl: string): ContentAccess {
  return {
    contentBaseUrl,
    baselineManifest: hydrated.manifest,
    readLocalBank: (language, difficulty) =>
      hydrated.banks.get(buildBankId(language, difficulty)) ??
      readBundledBank(language, difficulty),
  };
}

export function ContentProvider({
  contentBaseUrl,
  children,
}: {
  contentBaseUrl: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState<HydratedContent | null>(null);

  useEffect(() => {
    hydrateContent()
      .catch((err: unknown) => {
        logWarning({ err }, 'content hydration failed');
        return { manifest: BUNDLED, banks: new Map<string, CachedBank>() };
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
