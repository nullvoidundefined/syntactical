// state/__tests__/useQuestionBankMedium.test.tsx
// Area 2 RED (spec 1, "App"): only Easy banks are bundled, so a Medium bank downloads from the
// content host on first use. It is loading while the download is held, ready from the download,
// ready from the shared cache after a restart with no network, and an error with Retry when it
// cannot download and nothing is cached. It is never locked, and a signed-in user's Medium bank
// asks the API nothing: no entitlement check and no owner-scoped cache.
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
  countFetchesFor,
  hashUtf8Hex,
  listFetchedUrls,
  type FetchRoute,
  stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider } from '../ContentProvider';
import { useQuestionBank } from '../useQuestionBank';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { settle } from '../../config/settle';

const mockOwner: { current: string | null } = { current: null };

jest.mock('../AuthProvider', () => ({
  useSignedInUserId: () => mockOwner.current,
}));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/', contentBaseUrl: 'https://example.test/content/' });

jest.mock('../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const API_BASE = 'https://api.syntactical.dev/v1/';
const MEDIUM_URL = `${CONTENT_BASE_URL}python/medium.json`;
const SHARED_KEY = 'syntactical.content.v1.bank.python.medium';
const MEDIUM_IDS = ['py-medium-1', 'py-medium-2', 'py-medium-3'];
const MEDIUM_TEXT = buildBankText(MEDIUM_IDS);
const MEDIUM_HASH = hashUtf8Hex(MEDIUM_TEXT);
const OWNER = 'a6f1d1c2-0000-4000-8000-00000000000a';

let queryClient: QueryClient;
const observedStatuses: string[] = [];
const heldBodyRejections: Array<() => void> = [];

function buildManifest(): Manifest {
  const manifest = cloneBundledManifest();
  const python = manifest.languages.find(({ id }) => id === 'python')!;
  python.banks.medium = { ...python.banks.medium!, hash: MEDIUM_HASH };
  return manifest;
}

function respond(routes: Record<string, FetchRoute>) {
  return stubFetchRoutes(
    { [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(buildManifest())), ...routes },
    { shouldRejectUnrouted: true },
  );
}

function holdBody(): Promise<string> {
  return new Promise<string>((_resolve, reject) => {
    heldBodyRejections.push(() => reject(new TypeError('Network request failed')));
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>{children}</ContentProvider>
    </QueryClientProvider>
  );
}

function readIds(state: unknown): string[] | undefined {
  return (state as { bank?: { questions: { id: string }[] } }).bank?.questions.map(({ id }) => id);
}

async function renderMedium() {
  const rendered = await renderHook(
    () => {
      const state = useQuestionBank('python', 'medium');
      observedStatuses.push(state.status);
      return state;
    },
    { wrapper: Wrapper },
  );
  await settle();
  return rendered;
}

function listApiRequests(): string[] {
  return listFetchedUrls().filter((url) => url.startsWith(API_BASE));
}

describe('useQuestionBank for a Medium bank that is not bundled', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
    mockOwner.current = null;
    observedStatuses.length = 0;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    heldBodyRejections.splice(0).forEach((rejectHeldBody) => rejectHeldBody());
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('downloads from the content host for a signed-in user, caches it under the shared key, and asks the API nothing', async () => {
    mockOwner.current = OWNER;
    respond({ [MEDIUM_URL]: () => Promise.resolve(MEDIUM_TEXT) });

    const { result } = await renderMedium();

    await waitFor(() => expect(readIds(result.current)).toEqual(MEDIUM_IDS));
    expect(listApiRequests()).toEqual([]);
    const cached = JSON.parse((await AsyncStorage.getItem(SHARED_KEY)) ?? 'null') as { hash: string } | null;
    expect(cached?.hash).toBe(MEDIUM_HASH);
    expect(observedStatuses).not.toContain('locked');
  });

  it('is loading while the download is held open', async () => {
    respond({ [MEDIUM_URL]: holdBody });

    const { result } = await renderMedium();

    await waitFor(() => expect(countFetchesFor(MEDIUM_URL)).toBe(1));
    expect(result.current.status).toBe('loading');
  });

  it('plays the cached copy after a restart with no network', async () => {
    respond({ [MEDIUM_URL]: () => Promise.resolve(MEDIUM_TEXT) });
    const first = await renderMedium();
    await waitFor(() => expect(readIds(first.result.current)).toEqual(MEDIUM_IDS));
    await first.unmount();
    queryClient.clear();

    queryClient = createQueryClient();
    stubFetchRoutes({}, { shouldRejectUnrouted: true });
    const { result } = await renderMedium();

    await waitFor(() => expect(readIds(result.current)).toEqual(MEDIUM_IDS));
    expect(countFetchesFor(MEDIUM_URL)).toBe(0);
  });

  it('is an error with Retry when it cannot download and nothing is cached, and Retry downloads it', async () => {
    let isReachable = false;
    respond({
      [MEDIUM_URL]: () =>
        isReachable ? Promise.resolve(MEDIUM_TEXT) : Promise.reject(new TypeError('Network request failed')),
    });

    const { result } = await renderMedium();

    await waitFor(() => expect(result.current.status).toBe('error'));
    isReachable = true;
    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });
    await waitFor(() => expect(readIds(result.current)).toEqual(MEDIUM_IDS));
    expect(observedStatuses).not.toContain('locked');
  });
});
