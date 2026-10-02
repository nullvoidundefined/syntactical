import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import { BUNDLED_BANKS, BUNDLED_MANIFEST } from '../../services/content/bundledContent.generated';
import { readCachedBank } from '../../services/content/contentCache';
import type { Manifest } from '../../services/content/contentTypes';
import {
    CONTENT_BASE_URL,
    MANIFEST_URL,
    buildBankText,
    buildBoolQuestion,
    buildGoLanguage,
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
const GO_EASY_URL = `${CONTENT_BASE_URL}go/easy.json`;
const BUNDLED_PYTHON_EASY_HASH = (BUNDLED_MANIFEST as Manifest).languages[0].banks.easy!.hash;
const BUNDLED_PYTHON_EASY_IDS = (BUNDLED_BANKS['python/easy'] as { questions: { id: string }[] }).questions.map(
    (question) => question.id,
);
const GO_EASY_TEXT = buildBankText(['go-q-1', 'go-q-2']);
const GO_EASY_HASH = hashUtf8Hex(GO_EASY_TEXT);

let queryClient: QueryClient;

function ContentWrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>{children}</ContentProvider>
        </QueryClientProvider>
    );
}

function buildManifestWithGo(): Manifest {
    const manifest = cloneBundledManifest();
    manifest.languages.push(buildGoLanguage(GO_EASY_HASH) as never);
    return manifest;
}

function buildManifestWithPythonEasyHash(pythonEasyHash: string): Manifest {
    const manifest = cloneBundledManifest();
    manifest.languages[0].banks.easy = { path: 'python/easy.json', hash: pythonEasyHash };
    return manifest;
}

function respondWithManifest(manifest: unknown, bankRoutes: Record<string, FetchRoute> = {}) {
    return stubFetchRoutes({ [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(manifest)), ...bankRoutes });
}

function createDeferredBody() {
    let resolveBody: (body: string) => void = () => {};
    const bodyPromise = new Promise<string>((resolve) => {
        resolveBody = resolve;
    });
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
    });

    afterEach(() => {
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
            await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildManifestWithGo()));

            const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

            await waitFor(() => expect(result.current).toEqual(buildManifestWithGo()));
        });

        it('serves the bundled manifest before any fetch resolves when none is cached', async () => {
            const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

            await waitFor(() => expect(result.current).toEqual(BUNDLED_MANIFEST));
        });
    });

    describe('manifest refresh (B-13)', () => {
        it('replaces the manifest with a valid fetched manifest', async () => {
            respondWithManifest(buildManifestWithGo());

            const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

            await waitFor(() => expect(result.current?.languages.map((language) => language.id)).toContain('go'));
        });

        it('keeps the previous manifest when the fetched one has a newer schemaVersion', async () => {
            await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(buildManifestWithGo()));
            respondWithManifest({ ...cloneBundledManifest(), schemaVersion: 2 });

            const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

            await waitFor(() => expect(console.warn).toHaveBeenCalled());
            await settleBackgroundWork();
            expect(result.current).toEqual(buildManifestWithGo());
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

            await waitFor(async () => expect((await readCachedBank('python', 'easy'))?.hash).toBe(changedHash));
            await waitFor(() => expect(readBankIds(result.current)).toEqual(['py-new-1']));
            await settleBackgroundWork();
            expect(countFetchesFor(PYTHON_EASY_URL)).toBe(1);
            expect(new Set(listFetchedUrls())).toEqual(new Set([MANIFEST_URL, PYTHON_EASY_URL]));
        });

        it('prefetches and caches a bank with no local copy without anything asking for it', async () => {
            respondWithManifest(buildManifestWithGo(), { [GO_EASY_URL]: () => Promise.resolve(GO_EASY_TEXT) });

            await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

            await waitFor(async () => expect((await readCachedBank('go', 'easy'))?.hash).toBe(GO_EASY_HASH));
            expect((await readCachedBank('go', 'easy'))?.questions.map((question) => question.id)).toEqual([
                'go-q-1',
                'go-q-2',
            ]);
            await settleBackgroundWork();
            expect(new Set(listFetchedUrls())).toEqual(new Set([MANIFEST_URL, GO_EASY_URL]));
        });

        it('makes one request when the prefetch and two consumers of the same bank overlap', async () => {
            const { bodyPromise, resolveBody } = createDeferredBody();
            respondWithManifest(buildManifestWithGo(), { [GO_EASY_URL]: () => bodyPromise });

            const { result } = await renderHook(
                () => [useQuestionBank('go', 'easy'), useQuestionBank('go', 'easy')] as const,
                { wrapper: ContentWrapper },
            );

            await waitFor(() => expect(countFetchesFor(GO_EASY_URL)).toBe(1));
            await waitFor(() => expect(result.current?.map((bankState) => bankState.status)).toEqual(['loading', 'loading']));
            await act(async () => resolveBody(GO_EASY_TEXT));
            await waitFor(() => expect(result.current?.map((bankState) => bankState.status)).toEqual(['ready', 'ready']));
            expect(countFetchesFor(GO_EASY_URL)).toBe(1);
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
            expect(await readCachedBank('python', 'easy')).toBeNull();
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
            expect(await readCachedBank('python', 'easy')).toBeNull();
        });
    });

    describe('bank with no local copy (B-19)', () => {
        it('reports loading while the bank downloads', async () => {
            respondWithManifest(buildManifestWithGo(), { [GO_EASY_URL]: () => new Promise(() => {}) });

            const { result } = await renderHook(() => useQuestionBank('go', 'easy'), { wrapper: ContentWrapper });

            await waitFor(() => expect(result.current?.status).toBe('loading'));
        });

        it('reports an error with a Retry action when the download fails, and Retry requests it again', async () => {
            let isGoReachable = false;
            respondWithManifest(buildManifestWithGo(), {
                [GO_EASY_URL]: () =>
                    isGoReachable ? Promise.resolve(GO_EASY_TEXT) : Promise.reject(new TypeError('Network request failed')),
            });

            const { result } = await renderHook(() => useQuestionBank('go', 'easy'), { wrapper: ContentWrapper });

            await waitFor(() => expect(result.current?.status).toBe('error'));
            const requestsBeforeRetry = countFetchesFor(GO_EASY_URL);
            isGoReachable = true;
            await act(async () => {
                if (result.current.status === 'error') result.current.retry();
            });

            await waitFor(() => expect(result.current.status).toBe('ready'));
            expect(countFetchesFor(GO_EASY_URL)).toBeGreaterThan(requestsBeforeRetry);
            expect(readBankIds(result.current)).toEqual(['go-q-1', 'go-q-2']);
        });

        it('reports unknown for a language the manifest does not list', async () => {
            const { result } = await renderHook(() => useQuestionBank('cobol', 'easy'), { wrapper: ContentWrapper });

            await waitFor(() => expect(result.current?.status).toBe('unknown'));
        });
    });
});
