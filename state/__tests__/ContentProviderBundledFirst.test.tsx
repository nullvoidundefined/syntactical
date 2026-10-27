// state/__tests__/ContentProviderBundledFirst.test.tsx
// ContentProvider renders its children from the first render with the bundled manifest and banks,
// marked not hydrated, so the static web export and the first client render carry real route
// content. Once the cached content is read it switches to it. Until then no request goes out and no
// bank reads as unknown, because a track the bundled manifest lacks may still be in the cache.
import type { Manifest } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import {
  CONTENT_BASE_URL,
  MANIFEST_URL,
  buildAddedLanguage,
  buildBankText,
  cloneBundledManifest,
  hashUtf8Hex,
  listFetchedUrls,
  stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider, useContentContext } from '../ContentProvider';
import { useLanguageManifest } from '../useLanguageManifest';
import { useQuestionBank } from '../useQuestionBank';

jest.mock('../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const MANIFEST_KEY = 'syntactical.content.v1.manifest';
const ADDED_EASY_URL = `${CONTENT_BASE_URL}fixture-lang/easy.json`;
const ADDED_EASY_TEXT = buildBankText(['fixture-q-1', 'fixture-q-2']);
const BUNDLED_LANGUAGE_IDS = (BUNDLED_MANIFEST as Manifest).languages.map(({ id }) => id).join(',');
const BUNDLED_PYTHON_EASY_VERSION = (BUNDLED_MANIFEST as Manifest).languages[0].banks.easy!.contentVersion;

let queryClient: QueryClient;

// The manifest a returning visitor has cached: a newer Python Easy content version and one more
// track, so both the version and the language ids tell it apart from the bundled one.
function buildCachedManifest(): Manifest {
  const manifest = cloneBundledManifest();
  const pythonEasy = manifest.languages[0].banks.easy!;
  manifest.languages[0].banks.easy = { ...pythonEasy, contentVersion: pythonEasy.contentVersion + 1 };
  manifest.languages.push(buildAddedLanguage(hashUtf8Hex(ADDED_EASY_TEXT)) as never);
  return manifest;
}

function ManifestProbe() {
  const { isHydrated } = useContentContext();
  const { languages } = useLanguageManifest();
  return (
    <>
      <Text testID="content-hydrated">{String(isHydrated)}</Text>
      <Text testID="language-ids">{languages.map(({ id }) => id).join(',')}</Text>
      <Text testID="python-easy-version">{String(languages[0].banks.easy?.contentVersion)}</Text>
    </>
  );
}

function AddedBankProbe() {
  return <Text testID="added-bank-status">{useQuestionBank('fixture-lang', 'easy').status}</Text>;
}

function readText(testID: string): string {
  return String(screen.getByTestId(testID).props.children);
}

function renderProvider(contentBaseUrl: string | null, children: ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={contentBaseUrl}>{children}</ContentProvider>
    </QueryClientProvider>,
  );
}

// Holds every AsyncStorage read until release(), so a test can look at the provider before the
// cache read resolves. restore() puts the mock's own getItem back.
function holdStorageReads() {
  let openGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const realGetItem = jest.mocked(AsyncStorage.getItem).getMockImplementation();
  const spy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
    await gate;
    return realGetItem?.(key) ?? null;
  });
  return {
    release: () => act(async () => openGate()),
    restore: () => spy.mockImplementation(realGetItem),
  };
}

describe('ContentProvider before and after the cache read', () => {
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

  it('renders its children with the bundled manifest, not hydrated, before the cache read resolves', async () => {
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildCachedManifest()));
    const storage = holdStorageReads();
    try {
      await renderProvider(null, <ManifestProbe />);
      await settle();
      expect(readText('language-ids')).toBe(BUNDLED_LANGUAGE_IDS);
      expect(readText('python-easy-version')).toBe(String(BUNDLED_PYTHON_EASY_VERSION));
      expect(readText('content-hydrated')).toBe('false');
    } finally {
      storage.restore();
    }
  });

  it('switches to the cached manifest once the cache read resolves', async () => {
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildCachedManifest()));
    const storage = holdStorageReads();
    try {
      await renderProvider(null, <ManifestProbe />);
      await storage.release();
      await waitFor(() => expect(readText('content-hydrated')).toBe('true'));
      expect(readText('language-ids')).toBe(`${BUNDLED_LANGUAGE_IDS},fixture-lang`);
      expect(readText('python-easy-version')).toBe(String(BUNDLED_PYTHON_EASY_VERSION + 1));
    } finally {
      storage.restore();
    }
  });

  it('keeps the bundled manifest when nothing is cached', async () => {
    await renderProvider(null, <ManifestProbe />);
    await waitFor(() => expect(readText('content-hydrated')).toBe('true'));
    expect(readText('language-ids')).toBe(BUNDLED_LANGUAGE_IDS);
    expect(readText('python-easy-version')).toBe(String(BUNDLED_PYTHON_EASY_VERSION));
  });

  it('starts no request and reads no bank as unknown before the cache read', async () => {
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildCachedManifest()));
    stubFetchRoutes(
      {
        [ADDED_EASY_URL]: () => Promise.resolve(ADDED_EASY_TEXT),
        [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(buildCachedManifest())),
      },
      { shouldRejectUnrouted: true },
    );
    const storage = holdStorageReads();
    try {
      await renderProvider(CONTENT_BASE_URL, <AddedBankProbe />);
      await settle();
      expect(readText('added-bank-status')).toBe('loading');
      expect(listFetchedUrls()).toEqual([]);
      await storage.release();
      await waitFor(() => expect(readText('added-bank-status')).toBe('ready'));
      expect(listFetchedUrls()).toContain(ADDED_EASY_URL);
    } finally {
      storage.restore();
    }
  });
});
