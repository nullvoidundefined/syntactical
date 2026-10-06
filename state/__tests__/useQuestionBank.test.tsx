import type { Manifest } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import { BUNDLED_BANKS } from '../../services/content/bundledBanks.generated';
import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import { readCachedBank } from '../../services/content/readCachedBank';
import {
  CONTENT_BASE_URL,
  MANIFEST_URL,
  buildBankText,
  EMPTY_BANK_CONTEXT,
  buildBoolQuestion,
  buildAddedLanguage,
  cloneBundledManifest,
  countFetchesFor,
  hashUtf8Hex,
  listFetchedUrls,
  type FetchRoute,
  stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider } from '../ContentProvider';
import { useLanguageManifest } from '../useLanguageManifest';
import { useQuestionBank } from '../useQuestionBank';

jest.mock('../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const MANIFEST_KEY = 'syntactical.content.v1.manifest';
const PYTHON_EASY_KEY = 'syntactical.content.v1.bank.python.easy';
const PYTHON_EASY_URL = `${CONTENT_BASE_URL}python/easy.json`;
const ADDED_EASY_URL = `${CONTENT_BASE_URL}fixture-lang/easy.json`;
const BUNDLED_PYTHON_EASY_HASH = (BUNDLED_MANIFEST as Manifest).languages[0].banks.easy!.hash;
const BUNDLED_PYTHON_EASY_IDS = (BUNDLED_BANKS['python/easy'] as { questions: { id: string }[] }).questions.map(
  (question) => question.id,
);
const ADDED_EASY_TEXT = buildBankText(['fixture-q-1', 'fixture-q-2']);
const ADDED_EASY_HASH = hashUtf8Hex(ADDED_EASY_TEXT);

let queryClient: QueryClient;

function ContentWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>{children}</ContentProvider>
    </QueryClientProvider>
  );
}

function buildManifestWithAddedLanguage(): Manifest {
  const manifest = cloneBundledManifest();
  manifest.languages.push(buildAddedLanguage(ADDED_EASY_HASH) as never);
  return manifest;
}

function buildManifestWithPythonEasyHash(pythonEasyHash: string): Manifest {
  const manifest = cloneBundledManifest();
  manifest.languages[0].banks.easy = { ...manifest.languages[0].banks.easy!, hash: pythonEasyHash };
  return manifest;
}

// Unrouted URLs fail at once, so no request waits on the client's real
// 8-second timeout after a test ends.
function respondWithManifest(manifest: unknown, bankRoutes: Record<string, FetchRoute> = {}) {
  return stubFetchRoutes(
    { [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(manifest)), ...bankRoutes },
    { shouldRejectUnrouted: true },
  );
}

// Bodies a test holds open; afterEach fails any still pending so their
// request timers are cleared rather than left running past the test.
const heldBodyRejections: Array<() => void> = [];

function createDeferredBody() {
  let resolveBody: (body: string) => void = () => {};
  let rejectBody: (err: Error) => void = () => {};
  const bodyPromise = new Promise<string>((resolve, reject) => {
    resolveBody = resolve;
    rejectBody = reject;
  });
  heldBodyRejections.push(() => rejectBody(new TypeError('Network request failed')));
  return { bodyPromise, resolveBody };
}

async function settleBackgroundWork(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function readBankIds(bankState: unknown): string[] | undefined {
  const readyState = bankState as { status: string; bank?: { questions: { id: string }[] } } | undefined;
  return readyState?.bank?.questions.map((question) => question.id);
}

describe('useQuestionBank inside ContentProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    respondWithManifest(BUNDLED_MANIFEST);
  });

  afterEach(async () => {
    heldBodyRejections.splice(0).forEach((rejectHeldBody) => rejectHeldBody());
    await settleBackgroundWork();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  describe('cold start (B-15)', () => {
    it('serves the bundled bank before any fetch resolves when nothing is cached', async () => {
      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('ready'));
      expect(result.current.status === 'ready' && result.current.bank.hash).toBe(BUNDLED_PYTHON_EASY_HASH);
      expect(readBankIds(result.current)).toEqual(BUNDLED_PYTHON_EASY_IDS);
    });

    it('serves the cached bank over the bundled bank before any fetch resolves', async () => {
      const cachedHash = hashUtf8Hex('cached python easy');
      await AsyncStorage.setItem(
        PYTHON_EASY_KEY,
        JSON.stringify({ hash: cachedHash, questions: [buildBoolQuestion('q-cached')] }),
      );

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('ready'));
      expect(result.current.status === 'ready' && result.current.bank.hash).toBe(cachedHash);
      expect(readBankIds(result.current)).toEqual(['q-cached']);
    });

    it('ignores a cached schema 1 bank and serves the bundled schema 2 bank', async () => {
      const schemaOneBank = {
        hash: hashUtf8Hex('cached schema 1 python easy'),
        questions: [
          {
            id: 'q-v1',
            type: 'mc',
            prompt: 'p',
            choices: ['a', 'b'],
            answerIndex: 0,
            query: { title: 't', explanation: 'e' },
          },
        ],
      };
      await AsyncStorage.setItem(PYTHON_EASY_KEY, JSON.stringify(schemaOneBank));

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('ready'));
      expect(result.current.status === 'ready' && result.current.bank.hash).toBe(BUNDLED_PYTHON_EASY_HASH);
      expect(readBankIds(result.current)).toEqual(BUNDLED_PYTHON_EASY_IDS);
    });

    it('falls back to the bundled bank when the cached entry is truncated JSON', async () => {
      await AsyncStorage.setItem(PYTHON_EASY_KEY, '{"hash":"abc","questions":[{"id":');

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('ready'));
      expect(readBankIds(result.current)).toEqual(BUNDLED_PYTHON_EASY_IDS);
    });

    it('falls back to the bundled bank when the cached entry fails validation', async () => {
      await AsyncStorage.setItem(PYTHON_EASY_KEY, JSON.stringify({ hash: hashUtf8Hex('x'), questions: [] }));

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('ready'));
      expect(readBankIds(result.current)).toEqual(BUNDLED_PYTHON_EASY_IDS);
    });

    it('serves the cached manifest before any fetch resolves', async () => {
      await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildManifestWithAddedLanguage()));
      // Hold the manifest fetch open: a resolved fetch replaces the
      // cached manifest (B-13), so the check could otherwise miss it.
      const heldManifestBody = createDeferredBody();
      stubFetchRoutes({ [MANIFEST_URL]: () => heldManifestBody.bodyPromise }, { shouldRejectUnrouted: true });

      const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });
      // A loaded CI runner can settle background work before the first
      // check; the cached manifest must still be what the hook serves.
      await settleBackgroundWork();

      await waitFor(() => expect(result.current).toEqual(buildManifestWithAddedLanguage()));
    });

    it('serves the bundled manifest before any fetch resolves when none is cached', async () => {
      const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current).toEqual(BUNDLED_MANIFEST));
    });
  });

  describe('manifest refresh (B-13)', () => {
    it('replaces the manifest with a valid fetched manifest', async () => {
      respondWithManifest(buildManifestWithAddedLanguage());

      const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.languages.map((language) => language.id)).toContain('fixture-lang'));
    });

    it('keeps the previous manifest when the fetched one has a newer schemaVersion', async () => {
      await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildManifestWithAddedLanguage()));
      respondWithManifest({ ...cloneBundledManifest(), schemaVersion: 3 });

      const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

      await waitFor(() => expect(console.warn).toHaveBeenCalled());
      await settleBackgroundWork();
      expect(result.current).toEqual(buildManifestWithAddedLanguage());
    });
  });

  describe('background prefetch (B-16, B-17)', () => {
    it('fetches and caches a bank whose manifest hash changed, and fetches no unchanged bank', async () => {
      const changedText = buildBankText(['py-new-1']);
      const changedHash = hashUtf8Hex(changedText);
      respondWithManifest(buildManifestWithPythonEasyHash(changedHash), {
        [PYTHON_EASY_URL]: () => Promise.resolve(changedText),
      });

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(async () =>
        expect((await readCachedBank('python', 'easy', EMPTY_BANK_CONTEXT))?.hash).toBe(changedHash),
      );
      await waitFor(() => expect(readBankIds(result.current)).toEqual(['py-new-1']));
      await settleBackgroundWork();
      expect(countFetchesFor(PYTHON_EASY_URL)).toBe(1);
      expect(new Set(listFetchedUrls())).toEqual(new Set([MANIFEST_URL, PYTHON_EASY_URL]));
    });

    it('prefetches and caches a bank with no local copy without anything asking for it', async () => {
      respondWithManifest(buildManifestWithAddedLanguage(), {
        [ADDED_EASY_URL]: () => Promise.resolve(ADDED_EASY_TEXT),
      });

      await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

      await waitFor(async () =>
        expect((await readCachedBank('fixture-lang', 'easy', EMPTY_BANK_CONTEXT))?.hash).toBe(ADDED_EASY_HASH),
      );
      expect(
        (await readCachedBank('fixture-lang', 'easy', EMPTY_BANK_CONTEXT))?.questions.map((question) => question.id),
      ).toEqual(['fixture-q-1', 'fixture-q-2']);
      await settleBackgroundWork();
      expect(new Set(listFetchedUrls())).toEqual(new Set([MANIFEST_URL, ADDED_EASY_URL]));
    });

    it('discards a bank response for a manifest hash that is no longer current and serves the current bank', async () => {
      const staleText = buildBankText(['py-stale']);
      const staleHash = hashUtf8Hex(staleText);
      const currentText = buildBankText(['py-current']);
      const currentHash = hashUtf8Hex(currentText);
      await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildManifestWithPythonEasyHash(staleHash)));
      const staleBody = createDeferredBody();
      const fetchedManifestBody = createDeferredBody();
      let pythonEasyRequestCount = 0;
      stubFetchRoutes(
        {
          [MANIFEST_URL]: () => fetchedManifestBody.bodyPromise,
          [PYTHON_EASY_URL]: () => {
            pythonEasyRequestCount += 1;
            return pythonEasyRequestCount === 1 ? staleBody.bodyPromise : Promise.resolve(currentText);
          },
        },
        { shouldRejectUnrouted: true },
      );

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(countFetchesFor(PYTHON_EASY_URL)).toBe(1));
      await act(async () =>
        fetchedManifestBody.resolveBody(JSON.stringify(buildManifestWithPythonEasyHash(currentHash))),
      );
      await waitFor(() => expect(readBankIds(result.current)).toEqual(['py-current']));
      await waitFor(async () =>
        expect((await readCachedBank('python', 'easy', EMPTY_BANK_CONTEXT))?.hash).toBe(currentHash),
      );

      await act(async () => staleBody.resolveBody(staleText));
      await settleBackgroundWork();

      const cachedBank = await readCachedBank('python', 'easy', EMPTY_BANK_CONTEXT);
      expect(cachedBank?.hash).toBe(currentHash);
      expect(cachedBank?.questions.map((question) => question.id)).toEqual(['py-current']);
      expect(result.current.status === 'ready' && result.current.bank.hash).toBe(currentHash);
      expect(readBankIds(result.current)).toEqual(['py-current']);
    });

    it('makes one request when the prefetch and two consumers of the same bank overlap', async () => {
      const { bodyPromise, resolveBody } = createDeferredBody();
      respondWithManifest(buildManifestWithAddedLanguage(), { [ADDED_EASY_URL]: () => bodyPromise });

      const { result } = await renderHook(
        () => [useQuestionBank('fixture-lang', 'easy'), useQuestionBank('fixture-lang', 'easy')] as const,
        { wrapper: ContentWrapper },
      );

      await waitFor(() => expect(countFetchesFor(ADDED_EASY_URL)).toBe(1));
      await waitFor(() => expect(result.current?.map((bankState) => bankState.status)).toEqual(['loading', 'loading']));
      await act(async () => resolveBody(ADDED_EASY_TEXT));
      await waitFor(() => expect(result.current?.map((bankState) => bankState.status)).toEqual(['ready', 'ready']));
      expect(countFetchesFor(ADDED_EASY_URL)).toBe(1);
    });
  });

  describe('failed refresh with a local copy (B-18)', () => {
    it('keeps the bundled bank and shows no error when the bank fetch fails', async () => {
      respondWithManifest(buildManifestWithPythonEasyHash(hashUtf8Hex('unreachable')), {
        [PYTHON_EASY_URL]: () => Promise.reject(new TypeError('Network request failed')),
      });

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(countFetchesFor(PYTHON_EASY_URL)).toBeGreaterThan(0));
      await settleBackgroundWork();
      expect(result.current.status).toBe('ready');
      expect(readBankIds(result.current)).toEqual(BUNDLED_PYTHON_EASY_IDS);
      expect(await readCachedBank('python', 'easy', EMPTY_BANK_CONTEXT)).toBeNull();
    });

    it('keeps the bundled bank and shows no error when the bank response was redirected', async () => {
      const redirectedText = buildBankText(['py-redirected']);
      respondWithManifest(buildManifestWithPythonEasyHash(hashUtf8Hex(redirectedText)));
      const routedFetch = global.fetch as unknown as jest.Mock;
      const routeByUrl = routedFetch.getMockImplementation()!;
      routedFetch.mockImplementation((input: unknown) => {
        if (String(input) !== PYTHON_EASY_URL) return routeByUrl(input);
        return Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://elsewhere.test/python/easy.json',
          redirected: true,
          text: () => Promise.resolve(redirectedText),
        });
      });

      const { result } = await renderHook(() => useQuestionBank('python', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(countFetchesFor(PYTHON_EASY_URL)).toBeGreaterThan(0));
      await settleBackgroundWork();
      expect(result.current.status).toBe('ready');
      expect(readBankIds(result.current)).toEqual(BUNDLED_PYTHON_EASY_IDS);
      expect(await readCachedBank('python', 'easy', EMPTY_BANK_CONTEXT)).toBeNull();
    });
  });

  describe('bank with no local copy (B-19)', () => {
    it('reports loading while the bank downloads', async () => {
      const { bodyPromise } = createDeferredBody();
      respondWithManifest(buildManifestWithAddedLanguage(), { [ADDED_EASY_URL]: () => bodyPromise });

      const { result } = await renderHook(() => useQuestionBank('fixture-lang', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('loading'));
    });

    it('reports an error with a Retry action when the download fails, and Retry requests it again', async () => {
      let isAddedReachable = false;
      respondWithManifest(buildManifestWithAddedLanguage(), {
        [ADDED_EASY_URL]: () =>
          isAddedReachable ? Promise.resolve(ADDED_EASY_TEXT) : Promise.reject(new TypeError('Network request failed')),
      });

      const { result } = await renderHook(() => useQuestionBank('fixture-lang', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('error'));
      const requestsBeforeRetry = countFetchesFor(ADDED_EASY_URL);
      isAddedReachable = true;
      await act(async () => {
        if (result.current.status === 'error') result.current.retry();
      });

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(countFetchesFor(ADDED_EASY_URL)).toBeGreaterThan(requestsBeforeRetry);
      expect(readBankIds(result.current)).toEqual(['fixture-q-1', 'fixture-q-2']);
    });

    it('reports unknown for a language the manifest does not list', async () => {
      const { result } = await renderHook(() => useQuestionBank('cobol', 'easy'), { wrapper: ContentWrapper });

      await waitFor(() => expect(result.current?.status).toBe('unknown'));
    });
  });
});
