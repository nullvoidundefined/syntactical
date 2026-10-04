// PR #52 review findings on native (IAN-601). Boundaries the route already
// holds: the ?paywall param opens nothing for a guest or for a bank the user
// owns. RED for three bugs: an owner arriving with ?paywall=<bank> must not see
// the paywall (or record paywall_viewed) while GET me is still loading; after a
// pending purchase the route re-checks GET me on its own and unlocks the bank
// once the server lists it; signing out while the paywall is open closes it.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
    CONTENT_BASE_URL,
    MEDIUM_PRODUCT,
    NATIVE_PRICES,
    SIGNED_IN_USER,
    countMeRequests,
    fakeAuth,
    fakeServer,
    holdMe,
    nativeSdk,
    resetFakes,
    serveApp,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import DifficultyScreen from '../[language]/index';

const mockParams: { current: Record<string, string | string[] | undefined> } = {
    current: { language: 'python' },
};
const mockTrackEvent = jest.fn();

jest.mock('expo-constants', () => {
    // Built at run time so no credential-shaped literal sits in source.
    const { randomBytes: buildBytes } = require('node:crypto');
    return {
        expoConfig: {
            extra: {
                apiBaseUrl: 'https://api.syntactical.dev/v1/',
                contentBaseUrl: 'https://example.test/content/',
                revenueCatAppleKey: `appl_${buildBytes(12).toString('hex')}`,
                revenueCatGoogleKey: `goog_${buildBytes(12).toString('hex')}`,
            },
        },
    };
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
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildRouterModule(
        () => mockParams.current,
    ),
);
jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../../clients/analyticsClient', () => ({
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const MEDIUM_LOCKED = `Medium, locked, ${NATIVE_PRICES[MEDIUM_PRODUCT]}`;
const PURCHASE_PENDING = 'Your purchase is still processing. Check back shortly.';
const HIDDEN = { includeHiddenElements: true };

let queryClient: QueryClient;
// True while a test runs on jest's fake clock; settle then advances it.
let isFakeClock = false;

async function settle(): Promise<void> {
    await act(async () => {
        if (isFakeClock) await jest.advanceTimersByTimeAsync(50);
        else await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

function buildTree() {
    return (
        <QueryClientProvider client={queryClient}>
            <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
                <DifficultyScreen />
            </ContentProvider>
        </QueryClientProvider>
    );
}

async function renderDifficultyRoute() {
    const rendered = await render(buildTree());
    await settle();
    return rendered;
}

function countPaywallViews(): number {
    return mockTrackEvent.mock.calls.filter(([name]) => name === 'paywall_viewed').length;
}

function readSdk() {
    return require('react-native-purchases').default as Record<string, jest.Mock>;
}

async function openMediumPaywall() {
    await fireEvent.press(await screen.findByRole('button', { name: MEDIUM_LOCKED }));
    return screen.findByRole('dialog');
}

beforeEach(() => {
    resetFakes();
    queryClient = createQueryClient();
    mockParams.current = { language: 'python' };
    mockTrackEvent.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await settle();
    if (isFakeClock) {
        jest.useRealTimers();
        isFakeClock = false;
    }
    queryClient.clear();
    jest.restoreAllMocks();
});

describe('the paywall param on native (boundaries)', () => {
    it('opens nothing for a guest arriving with ?paywall=medium and makes no SDK call', async () => {
        fakeAuth.userId = null;
        serveApp();
        mockParams.current = { language: 'python', paywall: 'medium' };
        await renderDifficultyRoute();
        expect(await screen.findByRole('button', { name: /^Medium, locked/ })).toBeTruthy();
        await settle();

        expect(screen.queryByRole('dialog', HIDDEN)).toBeNull();
        expect(countPaywallViews()).toBe(0);
        expect(nativeSdk.purchasedProductIds).toEqual([]);
        expect(nativeSdk.restoreCount).toBe(0);
        const sdk = readSdk();
        expect(sdk.purchasePackage.mock.calls).toHaveLength(0);
        expect(sdk.restorePurchases.mock.calls).toHaveLength(0);
        expect(sdk.getOfferings.mock.calls).toHaveLength(0);
    });

    it('opens nothing for a signed-in user arriving with ?paywall=medium who owns medium', async () => {
        fakeAuth.userId = SIGNED_IN_USER;
        fakeServer.entitlements = [MEDIUM_PRODUCT];
        serveApp();
        mockParams.current = { language: 'python', paywall: 'medium' };
        await renderDifficultyRoute();
        await waitFor(() => expect(countMeRequests()).toBeGreaterThan(0));
        await settle();

        expect(screen.queryByRole('dialog', HIDDEN)).toBeNull();
        expect(screen.queryByRole('button', { name: /^Medium, locked/, ...HIDDEN })).toBeNull();
        expect(screen.getByRole('button', { name: /^Medium\b/, ...HIDDEN })).toBeTruthy();
    });
});

describe('PR #52 review findings on native (RED)', () => {
    it('never shows the paywall or records paywall_viewed for an owner arriving with ?paywall=medium while GET me is loading', async () => {
        fakeAuth.userId = SIGNED_IN_USER;
        fakeServer.entitlements = [MEDIUM_PRODUCT];
        serveApp();
        const releaseMe = holdMe();
        mockParams.current = { language: 'python', paywall: 'medium' };
        await renderDifficultyRoute();
        await waitFor(() => expect(countMeRequests()).toBeGreaterThan(0));
        await settle();

        expect(screen.queryByRole('dialog', HIDDEN)).toBeNull();
        expect(countPaywallViews()).toBe(0);

        releaseMe();
        await settle();
        await settle();

        expect(screen.queryByRole('dialog', HIDDEN)).toBeNull();
        expect(countPaywallViews()).toBe(0);
        expect(screen.getByRole('button', { name: /^Medium\b/, ...HIDDEN })).toBeTruthy();
    });

    it('after a pending purchase, re-checks GET me without user action and unlocks the bank within a few seconds once the server lists it', async () => {
        jest.useFakeTimers();
        isFakeClock = true;
        fakeAuth.userId = SIGNED_IN_USER;
        nativeSdk.purchaseBehavior = 'no-grant';
        serveApp();
        await renderDifficultyRoute();
        const dialog = await openMediumPaywall();
        await fireEvent.press(within(dialog).getByRole('button', { name: /^Buy\b/ }));
        await settle();
        await settle();
        expect(await screen.findByText(PURCHASE_PENDING, HIDDEN)).toBeTruthy();
        expect(screen.getByRole('button', { name: MEDIUM_LOCKED, ...HIDDEN })).toBeTruthy();

        // The RevenueCat webhook reaches the server after the purchase returned.
        fakeServer.entitlements = [MEDIUM_PRODUCT];
        const meAfterPurchase = countMeRequests();
        for (let elapsed = 0; elapsed < 5000; elapsed += 250) {
            await act(async () => {
                await jest.advanceTimersByTimeAsync(250);
            });
        }

        expect(countMeRequests()).toBeGreaterThan(meAfterPurchase);
        expect(screen.queryByRole('button', { name: /^Medium, locked/, ...HIDDEN })).toBeNull();
        expect(screen.getByRole('button', { name: /^Medium\b/, ...HIDDEN })).toBeTruthy();
    });

    it('closes the paywall when the user signs out while it is open, leaving no Buy button to press', async () => {
        fakeAuth.userId = SIGNED_IN_USER;
        serveApp();
        const rendered = await renderDifficultyRoute();
        await openMediumPaywall();

        fakeAuth.userId = null;
        await rendered.rerender(buildTree());
        await settle();

        expect(screen.queryByRole('dialog', HIDDEN)).toBeNull();
        expect(screen.queryByRole('button', { name: /^Buy\b/, ...HIDDEN })).toBeNull();
        expect(nativeSdk.purchasedProductIds).toEqual([]);
    });
});
