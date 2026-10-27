// app/__tests__/difficultyRouteFree.test.tsx
// Area 2 RED (spec 1, "App"): every bank is free, so the difficulty route sells nothing. For a
// signed-in user it asks the API nothing and loads no store prices, the retired ?paywall= param
// opens no dialog, and a Medium bank downloaded from the content host opens its topic step like
// the Easy bank. Real DifficultyStep and useQuestionBank; the content host and the API (a routed
// fetch), auth, the router, the store SDK, and analytics are fakes.
import type { Manifest } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
  API_BASE,
  SIGNED_IN_USER,
  fakeAuth,
  listNavigatedUrls,
  resetFakes,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import {
  CONTENT_BASE_URL,
  MANIFEST_URL,
  buildBankText,
  cloneBundledManifest,
  countFetchesFor,
  hashUtf8Hex,
  listFetchedUrls,
  stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider } from '../../state/ContentProvider';
import DifficultyScreen from '../[language]/index';
import { randomBytes } from 'node:crypto';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { settle } from '../../config/settle';

const mockParams: { current: Record<string, string | string[] | undefined> } = {
  current: { language: 'python', paywall: 'medium' },
};
const mockTrackEvent = jest.fn();

// Built at run time so no credential-shaped literal sits in source.
setExpoExtra({
  apiBaseUrl: 'https://api.syntactical.dev/v1/',
  contentBaseUrl: 'https://example.test/content/',
  revenueCatAppleKey: `appl_${randomBytes(12).toString('hex')}`,
  revenueCatGoogleKey: `goog_${randomBytes(12).toString('hex')}`,
});
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));
jest.mock('react-native-purchases', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildNativePurchasesModule(),
);
jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('expo-router', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildRouterModule(() => mockParams.current),
);
jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: (...args: unknown[]) => mockTrackEvent(...args) }));

const MEDIUM_URL = `${CONTENT_BASE_URL}python/medium.json`;
const MEDIUM_TEXT = buildBankText(['py-medium-1', 'py-medium-2']);

let queryClient: QueryClient;

function readGetOfferings(): jest.Mock {
  return jest.requireMock<{ default: { getOfferings: jest.Mock } }>('react-native-purchases').default.getOfferings;
}

function buildManifest(): Manifest {
  const manifest = cloneBundledManifest();
  const python = manifest.languages.find(({ id }) => id === 'python')!;
  python.banks.medium = { ...python.banks.medium!, hash: hashUtf8Hex(MEDIUM_TEXT) };
  return manifest;
}

// The content host serves the manifest and python/medium; every other request fails like an
// offline one, and is still recorded.
function serveContent() {
  return stubFetchRoutes(
    {
      [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(buildManifest())),
      [MEDIUM_URL]: () => Promise.resolve(MEDIUM_TEXT),
    },
    { shouldRejectUnrouted: true },
  );
}

async function renderDifficultyRoute(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
        <DifficultyScreen />
      </ContentProvider>
    </QueryClientProvider>,
  );
  await settle();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
  mockParams.current = { language: 'python', paywall: 'medium' };
  serveContent();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('difficulty route with every bank free', () => {
  it('asks the API nothing and loads no store prices for a signed-in user', async () => {
    await renderDifficultyRoute();
    await screen.findByRole('button', { name: /^Medium/ });
    await settle();

    expect(listFetchedUrls().filter((url) => url.startsWith(API_BASE))).toEqual([]);
    expect(readGetOfferings()).not.toHaveBeenCalled();
  });

  it('opens no dialog and records no paywall view for the retired ?paywall= param', async () => {
    await renderDifficultyRoute();
    await screen.findByRole('button', { name: /^Medium/ });
    await settle();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockTrackEvent.mock.calls.filter(([name]) => name === 'paywall_viewed')).toEqual([]);
  });

  it('opens the Medium topic step once the bank downloads from the content host', async () => {
    await renderDifficultyRoute();
    const medium = await screen.findByRole('button', { name: /^Medium/ });
    await waitFor(() => expect(medium).toBeEnabled());

    await fireEvent.press(medium);

    expect(listNavigatedUrls().map(({ pathname }) => pathname)).toContain('/python/medium');
    expect(countFetchesFor(MEDIUM_URL)).toBe(1);
  });
});
