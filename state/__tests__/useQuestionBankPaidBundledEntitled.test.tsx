// B-44a regression guards (B-37, B-44, B-60): with the unmodified bundled manifest,
// the bundle carries no paid copy, so an owner entitled to python/medium requests it
// from the API (never the static host), and a free bank still plays from the bundle
// for a guest.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import { BUNDLED_BANKS } from '../../services/content/bundledBanks.generated';
import {
  CONTENT_BASE_URL,
  MANIFEST_URL,
  cloneBundledManifest,
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
const PAID_BANKS_PREFIX = `${API_BASE}banks/`;
const ME_URL = `${API_BASE}me`;
const STATIC_PAID_URL = `${CONTENT_BASE_URL}python/medium.json`;
const MEDIUM_API_URL = `${PAID_BANKS_PREFIX}python/medium`;
const MEDIUM_PRODUCT = 'syntactical.python.medium';
const OWNER_A = 'a6f1d1c2-0000-4000-8000-00000000000a';

let queryClient: QueryClient;

function bundledIds(key: string): string[] {
  return (BUNDLED_BANKS[key] as { questions: { id: string }[] }).questions.map(({ id }) => id);
}

function meRoute(productIds: string[]): FetchRoute {
  return () => Promise.resolve(JSON.stringify({ data: { entitlements: productIds } }));
}

function respond(routes: Record<string, FetchRoute>) {
  return stubFetchRoutes(
    { [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(cloneBundledManifest())), ...routes },
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

async function renderBank(difficulty: string) {
  const rendered = await renderHook(() => useQuestionBank('python', difficulty), { wrapper: Wrapper });
  await waitFor(() => expect(listFetchedUrls()).toContain(MANIFEST_URL));
  await settle();
  return rendered;
}

function listPaidBankRequests(): string[] {
  return listFetchedUrls().filter((url) => url.startsWith(PAID_BANKS_PREFIX) || url === STATIC_PAID_URL);
}

describe('useQuestionBank with the unmodified bundled manifest', () => {
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

  it('bundles no paid bank, so an entitled owner requests it from the API and never the static host', async () => {
    // Only the free easy bank of each language is bundled; the list grows as languages are added.
    expect(Object.keys(BUNDLED_BANKS).length).toBeGreaterThan(0);
    expect(Object.keys(BUNDLED_BANKS).every((key) => key.endsWith('/easy'))).toBe(true);
    mockOwner.current = OWNER_A;
    respond({ [ME_URL]: meRoute([MEDIUM_PRODUCT]) });

    const { result, unmount } = await renderBank('medium');

    await waitFor(() => expect(listPaidBankRequests()).toContain(MEDIUM_API_URL));
    expect(listPaidBankRequests()).not.toContain(STATIC_PAID_URL);
    expect(result.current.status).not.toBe('ready');
    await unmount();
  });

  it('still plays a free bank from the bundle for a guest', async () => {
    respond({});

    const { result, unmount } = await renderBank('easy');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(readIds(result.current)).toEqual(bundledIds('python/easy'));
    expect(listFetchedUrls().filter((url) => url.startsWith(API_BASE))).toEqual([]);
    await unmount();
  });
});
