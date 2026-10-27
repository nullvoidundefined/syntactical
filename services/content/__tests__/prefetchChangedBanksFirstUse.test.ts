// services/content/__tests__/prefetchChangedBanksFirstUse.test.ts
// Area 2 RED (spec 1, "App"): Medium and Hard banks download on first use, so the prefetch after a
// manifest refresh refreshes only banks the device already has. A local copy is whatever
// `readLocalBank` returns: the cached bank, else the bundled one, as `ContentProvider` builds it.
// A bundled Easy bank and a cached Medium bank whose manifest hash changed are fetched again; a
// Medium bank never opened on this device has no local copy and is not fetched.
import type { CachedBank, Manifest, Question } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { prefetchChangedBanks } from '../prefetchChangedBanks';
import type { ContentAccess } from '../types/ContentAccess';

import {
  CONTENT_BASE_URL,
  buildBankText,
  buildBoolQuestion,
  cloneBundledManifest,
  countFetchesFor,
  hashUtf8Hex,
  listFetchedUrls,
  stubFetchRoutes,
} from './fixtures/contentFixtures';

jest.mock('../../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const EASY_URL = `${CONTENT_BASE_URL}python/easy.json`;
const MEDIUM_URL = `${CONTENT_BASE_URL}python/medium.json`;
const NEW_EASY_TEXT = buildBankText(['py-easy-new-1', 'py-easy-new-2']);
const NEW_MEDIUM_TEXT = buildBankText(['py-medium-new-1', 'py-medium-new-2']);
const NEW_EASY_HASH = hashUtf8Hex(NEW_EASY_TEXT);
const NEW_MEDIUM_HASH = hashUtf8Hex(NEW_MEDIUM_TEXT);
const OLD_MEDIUM_HASH = hashUtf8Hex(buildBankText(['py-medium-old-1']));

let queryClient: QueryClient;

function findPython(manifest: Manifest) {
  return manifest.languages.find(({ id }) => id === 'python')!;
}

const BUNDLED_EASY_HASH = findPython(cloneBundledManifest()).banks.easy!.hash;

// The python track alone, with the given Easy and Medium hashes, so any fetch the prefetch makes
// is one of python's three banks.
function buildPythonManifest(hashes: { easy: string; medium: string }): Manifest {
  const manifest = cloneBundledManifest();
  const python = findPython(manifest);
  python.banks.easy = { ...python.banks.easy!, hash: hashes.easy };
  python.banks.medium = { ...python.banks.medium!, hash: hashes.medium };
  return { ...manifest, languages: [python] };
}

function buildLocalBank(hash: string): CachedBank {
  return { hash, questions: ['local-1', 'local-2'].map(buildBoolQuestion) as Question[] };
}

// The device's local copies by `language/difficulty`. A bank that is neither cached nor bundled
// reads as null, as it does in ContentProvider.
function prefetch(manifest: Manifest, localBanks: Record<string, CachedBank>): void {
  const access: ContentAccess = {
    baselineManifest: manifest,
    contentBaseUrl: CONTENT_BASE_URL,
    readLocalBank: (language, difficulty) => localBanks[`${language}/${difficulty}`] ?? null,
  };
  queryClient.setQueryData(['manifest'], manifest);
  prefetchChangedBanks(queryClient, manifest, access);
}

describe('prefetchChangedBanks before a bank is first used', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('does not fetch a Medium bank the device has never opened', async () => {
    stubFetchRoutes({});
    const manifest = buildPythonManifest({ easy: BUNDLED_EASY_HASH, medium: NEW_MEDIUM_HASH });

    prefetch(manifest, { 'python/easy': buildLocalBank(BUNDLED_EASY_HASH) });
    await settle();

    expect(countFetchesFor(MEDIUM_URL)).toBe(0);
    expect(listFetchedUrls()).toEqual([]);
  });

  it('fetches a cached Medium bank again when its manifest hash changed', async () => {
    stubFetchRoutes({ [MEDIUM_URL]: async () => NEW_MEDIUM_TEXT });
    const manifest = buildPythonManifest({ easy: BUNDLED_EASY_HASH, medium: NEW_MEDIUM_HASH });

    prefetch(manifest, {
      'python/easy': buildLocalBank(BUNDLED_EASY_HASH),
      'python/medium': buildLocalBank(OLD_MEDIUM_HASH),
    });

    await waitFor(() => expect(countFetchesFor(MEDIUM_URL)).toBe(1));
    expect(countFetchesFor(EASY_URL)).toBe(0);
  });

  it('fetches the bundled Easy bank again when its manifest hash changed', async () => {
    stubFetchRoutes({ [EASY_URL]: async () => NEW_EASY_TEXT });
    const manifest = buildPythonManifest({ easy: NEW_EASY_HASH, medium: NEW_MEDIUM_HASH });

    prefetch(manifest, { 'python/easy': buildLocalBank(BUNDLED_EASY_HASH) });

    await waitFor(() => expect(countFetchesFor(EASY_URL)).toBe(1));
  });
});
