// Task 3.15 (B-44): paid banks load through apiFetch for an entitled owner, are
// hash-checked, cached under that owner's key only, and play offline after a
// restart; a guest's launch requests no paid bank; another account on the same
// device never sees the first account's copy; a hash mismatch discards the body.
import type { Manifest } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import {
    CONTENT_BASE_URL,
    MANIFEST_URL,
    buildBankText,
    cloneBundledManifest,
    hashUtf8Hex,
    listFetchedUrls,
    type FetchRoute,
    stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider } from '../ContentProvider';
import { PaidBankPrefetch } from '../PaidBankPrefetch';
import { useQuestionBank } from '../useQuestionBank';

const mockOwner: { current: string | null } = { current: null };

jest.mock('../AuthProvider', () => ({
    useSignedInUserId: () => mockOwner.current,
}));

jest.mock('expo-secure-store', () => ({
    deleteItemAsync: jest.fn(() => Promise.resolve()),
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-constants', () => ({
    expoConfig: {
        extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/', contentBaseUrl: 'https://example.test/content/' },
    },
}));

jest.mock('../../clients/hashClient', () => ({
    hashTextSha256: async (text: string) =>
        require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const API_BASE = 'https://api.syntactical.dev/v1/';
const ME_URL = `${API_BASE}me`;
const PAID_URL = `${API_BASE}banks/python/medium`;
const STATIC_PAID_URL = `${CONTENT_BASE_URL}python/medium.json`;
const MEDIUM_PRODUCT = 'syntactical.python.medium';
const SHARED_KEY = 'syntactical.content.v1.bank.python.medium';
const PAID_IDS = ['paid-1', 'paid-2', 'paid-3'];
const PAID_TEXT = buildBankText(PAID_IDS);
const PAID_HASH = hashUtf8Hex(PAID_TEXT);
const OWNER_A = 'a6f1d1c2-0000-4000-8000-00000000000a';
const OWNER_B = 'b6f1d1c2-0000-4000-8000-00000000000b';

let queryClient: QueryClient;

function ownerKey(ownerUserId: string): string {
    return `syntactical.content.v1.paid.${ownerUserId}.python.medium`;
}

// The bundled medium bank no longer matches, as after the private content split.
function buildPaidManifest(): Manifest {
    const manifest = cloneBundledManifest();
    const python = manifest.languages.find(({ id }) => id === 'python')!;
    python.banks.medium = { ...python.banks.medium!, hash: PAID_HASH };
    return manifest;
}

function meRoute(productIds: string[]): FetchRoute {
    return () => Promise.resolve(JSON.stringify({ data: { entitlements: productIds } }));
}

function respond(routes: Record<string, FetchRoute>) {
    return stubFetchRoutes(
        { [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(buildPaidManifest())), ...routes },
        { shouldRejectUnrouted: true },
    );
}

function Wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
                <PaidBankPrefetch />
                {children}
            </ContentProvider>
        </QueryClientProvider>
    );
}

function readIds(state: unknown): string[] | undefined {
    return (state as { bank?: { questions: { id: string }[] } }).bank?.questions.map(({ id }) => id);
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

async function renderMedium() {
    const rendered = await renderHook(() => useQuestionBank('python', 'medium'), { wrapper: Wrapper });
    // The fetched manifest (with the new paid hash) replaces the bundled baseline.
    await waitFor(() => expect(listFetchedUrls()).toContain(MANIFEST_URL));
    await settle();
    return rendered;
}

describe('useQuestionBank for a paid bank', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        queryClient = createQueryClient();
        mockOwner.current = null;
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        await settle();
        queryClient.clear();
        jest.restoreAllMocks();
    });

    it('is locked for a guest, and a guest launch requests no paid bank from the API or the static host', async () => {
        respond({});

        const { result } = await renderMedium();

        await waitFor(() => expect(result.current.status).toBe('locked'));
        const fetched = listFetchedUrls();
        expect(fetched.filter((url) => url.startsWith(API_BASE))).toEqual([]);
        expect(fetched).not.toContain(STATIC_PAID_URL);
    });

    it('downloads through the API for an entitled owner and caches it under that owner only', async () => {
        mockOwner.current = OWNER_A;
        respond({ [ME_URL]: meRoute([MEDIUM_PRODUCT]), [PAID_URL]: () => Promise.resolve(PAID_TEXT) });

        const { result } = await renderMedium();

        await waitFor(() => expect(readIds(result.current)).toEqual(PAID_IDS));
        expect(listFetchedUrls()).toContain(PAID_URL);
        expect(listFetchedUrls()).not.toContain(STATIC_PAID_URL);
        const owned = JSON.parse((await AsyncStorage.getItem(ownerKey(OWNER_A))) ?? 'null') as { hash: string };
        expect(owned.hash).toBe(PAID_HASH);
        expect(await AsyncStorage.getItem(SHARED_KEY)).toBeNull();
    });

    it('plays the cached paid bank offline after a restart', async () => {
        mockOwner.current = OWNER_A;
        respond({ [ME_URL]: meRoute([MEDIUM_PRODUCT]), [PAID_URL]: () => Promise.resolve(PAID_TEXT) });
        const first = await renderMedium();
        await waitFor(() => expect(readIds(first.result.current)).toEqual(PAID_IDS));
        await first.unmount();
        queryClient.clear();

        // Restart with no network at all: every request fails.
        queryClient = createQueryClient();
        stubFetchRoutes({}, { shouldRejectUnrouted: true });
        const { result } = await renderHook(() => useQuestionBank('python', 'medium'), { wrapper: Wrapper });

        await waitFor(() => expect(readIds(result.current)).toEqual(PAID_IDS));
        expect(listFetchedUrls()).not.toContain(PAID_URL);
    });

    it('never shows one account the paid bank another account cached on the same device', async () => {
        const { questions } = JSON.parse(PAID_TEXT) as { questions: unknown[] };
        await AsyncStorage.setItem(ownerKey(OWNER_A), JSON.stringify({ hash: PAID_HASH, questions }));
        mockOwner.current = OWNER_B;
        respond({ [ME_URL]: meRoute([]), [PAID_URL]: () => Promise.resolve(PAID_TEXT) });

        const { result } = await renderMedium();

        await waitFor(() => expect(result.current.status).toBe('locked'));
        expect(listFetchedUrls()).not.toContain(PAID_URL);
        expect(await AsyncStorage.getItem(ownerKey(OWNER_B))).toBeNull();
    });

    it('discards a body whose hash does not match the manifest and caches nothing', async () => {
        mockOwner.current = OWNER_A;
        respond({
            [ME_URL]: meRoute([MEDIUM_PRODUCT]),
            [PAID_URL]: () => Promise.resolve(buildBankText(['tampered'])),
        });

        const { result } = await renderMedium();

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(await AsyncStorage.getItem(ownerKey(OWNER_A))).toBeNull();
        expect(await AsyncStorage.getItem(SHARED_KEY)).toBeNull();
    });

    it('does not download a paid bank the owner holds no entitlement for', async () => {
        mockOwner.current = OWNER_A;
        respond({ [ME_URL]: meRoute(['syntactical.python.hard']), [PAID_URL]: () => Promise.resolve(PAID_TEXT) });

        const { result } = await renderMedium();

        await waitFor(() => expect(result.current.status).toBe('locked'));
        expect(listFetchedUrls()).not.toContain(PAID_URL);
    });
});
