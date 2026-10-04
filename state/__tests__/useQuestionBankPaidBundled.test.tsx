// B-44a (B-37, B-42, B-44): a paid bank plays only for a signed-in owner entitled
// to its productId. The unmodified bundled manifest marks python/medium paid, and
// since the content split (B-60) the bundle carries no paid copy at all, so a guest
// or an unentitled owner stays locked and never requests python/medium.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
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
const OWNER_A = 'a6f1d1c2-0000-4000-8000-00000000000a';

let queryClient: QueryClient;
const observedStatuses: string[] = [];

function meRoute(productIds: string[]): FetchRoute {
  return () => Promise.resolve(JSON.stringify({ data: { entitlements: productIds } }));
}

// The manifest served is the unmodified bundled one.
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

// Records every status the hook ever returns, so a transient 'ready' is caught too.
async function renderMedium() {
  const rendered = await renderHook(
    () => {
      const state = useQuestionBank('python', 'medium');
      observedStatuses.push(state.status);
      return state;
    },
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(listFetchedUrls()).toContain(MANIFEST_URL));
  await settle();
  return rendered;
}

// Requests for python/medium only: an owner entitled to another paid bank may prefetch that one.
function listMediumRequests(): string[] {
  return listFetchedUrls().filter((url) => url === MEDIUM_API_URL || url === STATIC_PAID_URL);
}

describe('useQuestionBank for a paid bank that is not bundled', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
    mockOwner.current = null;
    observedStatuses.length = 0;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('is locked for a guest, never ready, and requests no paid bank', async () => {
    respond({});

    const { result, unmount } = await renderMedium();

    await waitFor(() => expect(result.current.status).toBe('locked'));
    await settle();
    expect(result.current.status).toBe('locked');
    expect(observedStatuses).not.toContain('ready');
    expect(readIds(result.current)).toBeUndefined();
    expect(listMediumRequests()).toEqual([]);
    await unmount();
  });

  it('is locked for a signed-in owner whose entitlements do not include the bank', async () => {
    mockOwner.current = OWNER_A;
    respond({ [ME_URL]: meRoute(['syntactical.python.hard']) });

    const { result, unmount } = await renderMedium();

    await waitFor(() => expect(listFetchedUrls()).toContain(ME_URL));
    await waitFor(() => expect(result.current.status).toBe('locked'));
    await settle();
    expect(result.current.status).toBe('locked');
    expect(observedStatuses).not.toContain('ready');
    expect(readIds(result.current)).toBeUndefined();
    expect(listMediumRequests()).toEqual([]);
    await unmount();
  });
});
