// Serves the bundled manifest and banks from the first render, so the static web
// export and the first client render carry real route content, then reads the
// cached manifest and every cached bank once and switches to them. isHydrated on
// the context says which: a route that resolves content from its query waits for
// it. Rounds never wait on the network. Once the cache is read it refreshes the
// manifest and refetches every local bank whose hash changed.
import { buildBankContext, validateQuestionBank } from '@syntactical/content-schema';
import type { CachedBank, Manifest } from '@syntactical/content-schema';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { logWarning } from '../clients/logClient';
import { removeRetiredBankKeys } from '../services/content/bankStore';
import { buildManifestQuery } from '../services/content/buildManifestQuery';
import { BUNDLED_BANKS } from '../services/content/bundledBanks.generated';
import { BUNDLED_MANIFEST } from '../services/content/bundledManifest.generated';
import { findBankEntry } from '../services/content/findBankEntry';
import { findLanguageEntry } from '../services/content/findLanguageEntry';
import { prefetchChangedBanks } from '../services/content/prefetchChangedBanks';
import { readCachedBank } from '../services/content/readCachedBank';
import { readCachedManifest } from '../services/content/readCachedManifest';
import { readDownloadedBank } from '../services/content/readDownloadedBank';
import type { ContentAccess } from '../services/content/types/ContentAccess';

type HydratedContent = { banks: Map<string, CachedBank>; manifest: Manifest };

const ContentContext = createContext<ContentAccess | null>(null);
const BUNDLED = BUNDLED_MANIFEST;
// What every render uses until the cache read finishes, and what a failed read
// falls back to: no cached banks, so readLocalBank serves the bundled ones.
const BUNDLED_CONTENT: HydratedContent = { banks: new Map(), manifest: BUNDLED };

function buildBankId(language: string, difficulty: string): string {
  return `${language}/${difficulty}`;
}

function readBundledBank(language: string, difficulty: string): CachedBank | null {
  const entry = findBankEntry(BUNDLED, language, difficulty);
  const languageEntry = findLanguageEntry(BUNDLED.languages, language);
  if (!entry || !languageEntry) return null;
  const result = validateQuestionBank(
    BUNDLED_BANKS[buildBankId(language, difficulty)],
    buildBankContext(languageEntry),
  );
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
  await removeRetiredBankKeys();
  const manifest = (await readCachedManifest()) ?? BUNDLED;
  return { banks: await readAllCachedBanks(manifest), manifest };
}

// A bank downloaded this session wins over the startup snapshot, so reviews and the prefetch see it without a
// restart; the snapshot wins over the bundle. Before the cache read the snapshot is empty and nothing has
// downloaded, so only bundled banks are local.
function buildContentAccess(
  content: HydratedContent,
  contentBaseUrl: string | null,
  queryClient: QueryClient,
  isHydrated: boolean,
): ContentAccess {
  const { banks, manifest } = content;
  return {
    baselineManifest: manifest,
    contentBaseUrl,
    isHydrated,
    readLocalBank: (language, difficulty) =>
      readDownloadedBank(queryClient, language, difficulty) ??
      banks.get(buildBankId(language, difficulty)) ??
      readBundledBank(language, difficulty),
  };
}

export function ContentProvider({ contentBaseUrl, children }: { contentBaseUrl: string | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState<HydratedContent | null>(null);
  const isHydrated = hydrated !== null;

  useEffect(() => {
    hydrateContent()
      .catch((err: unknown) => {
        logWarning({ err }, 'content hydration failed');
        return BUNDLED_CONTENT;
      })
      .then(setHydrated);
  }, []);

  const access = useMemo(
    () => buildContentAccess(hydrated ?? BUNDLED_CONTENT, contentBaseUrl, queryClient, isHydrated),
    [hydrated, contentBaseUrl, isHydrated, queryClient],
  );

  // The refresh waits for the cache read, so it compares against what the device holds.
  const { data: fetchedManifest } = useQuery(buildManifestQuery(contentBaseUrl, isHydrated));

  useEffect(() => {
    if (isHydrated && fetchedManifest) prefetchChangedBanks(queryClient, fetchedManifest, access);
  }, [access, fetchedManifest, isHydrated, queryClient]);

  return <ContentContext.Provider value={access}>{children}</ContentContext.Provider>;
}

export function useContentContext(): ContentAccess {
  const access = useContext(ContentContext);
  if (!access) throw new Error('useContentContext must be used inside ContentProvider');
  return access;
}
