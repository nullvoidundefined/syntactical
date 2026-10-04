// Task 3.18 RED (B-42, Review Focus 3, security boundary) on native: the
// difficulty route shows a paid bank without its entitlement as locked with the
// store's localized priceString; selecting it opens the paywall (one
// paywall_viewed event) or, for a guest, sends them to sign-in with a return to
// that bank's paywall; Buy goes through react-native-purchases' purchasePackage
// and then GET me, and only GET me unlocks: neither a cancelled or failed
// purchase nor the SDK's own success result unlocks anything. Offline, a bank
// owned per the last GET me with no local copy says "Needs a connection", not
// the paywall. Real DifficultyStep, useQuestionBank, useEntitlements,
// usePurchases, and PaywallSheet; the SDK, the server (a routed fetch), auth,
// the router, and analytics are fakes.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
    CONTENT_BASE_URL,
    HARD_PRODUCT,
    MEDIUM_PRODUCT,
    NATIVE_PRICES,
    SIGNED_IN_USER,
    countMeRequests,
    fakeAuth,
    fakeServer,
    listNavigatedUrls,
    nativeSdk,
    resetFakes,
    serveApp,
    toUrl,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import DifficultyScreen from '../[language]/index';

const mockParams: { current: Record<string, string | string[] | undefined> } = {
    current: { language: 'python' },
};
const mockIsOnline = { current: true };
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
jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => mockIsOnline.current }));
// analyticsClient lands from a parallel PR; virtual until then.
jest.mock(
    '../../clients/analyticsClient',
    () => ({ trackEvent: (...args: unknown[]) => mockTrackEvent(...args) }),
    { virtual: true },
);

const MEDIUM_LOCKED = `Medium, locked, ${NATIVE_PRICES[MEDIUM_PRODUCT]}`;
const HARD_LOCKED = `Hard, locked, ${NATIVE_PRICES[HARD_PRODUCT]}`;
const HIDDEN = { includeHiddenElements: true };

let queryClient: QueryClient;

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
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

function countPaywallViews(): number {
    return mockTrackEvent.mock.calls.filter(([name]) => name === 'paywall_viewed').length;
}

async function openMediumPaywall() {
    await fireEvent.press(await screen.findByRole('button', { name: MEDIUM_LOCKED }));
    return screen.findByRole('dialog');
}

async function pressBuy(dialog: ReturnType<typeof screen.getByRole>): Promise<void> {
    await fireEvent.press(within(dialog).getByRole('button', { name: /^Buy\b/ }));
    await settle();
}

function expectMediumUnlocked(): void {
    expect(screen.queryByRole('button', { name: /^Medium, locked/, ...HIDDEN })).toBeNull();
    expect(screen.getByRole('button', { name: /^Medium\b/, ...HIDDEN })).toBeTruthy();
}

beforeEach(() => {
    resetFakes();
    queryClient = createQueryClient();
    mockParams.current = { language: 'python' };
    mockIsOnline.current = true;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
});

describe('difficulty route paywall on native', () => {
    describe('a signed-in user without the entitlement', () => {
        beforeEach(() => {
            fakeAuth.userId = SIGNED_IN_USER;
            serveApp();
        });

        it('names each locked paid bank "<Difficulty>, locked, <store priceString>" and leaves the free bank unlocked', async () => {
            await renderDifficultyRoute();
            expect(await screen.findByRole('button', { name: MEDIUM_LOCKED })).toBeTruthy();
            expect(screen.getByRole('button', { name: HARD_LOCKED })).toBeTruthy();
            expect(screen.queryByRole('button', { name: /^Easy, locked/ })).toBeNull();
        });

        it('names the bank without a price, never a hard-coded one, when the store offering cannot be read', async () => {
            nativeSdk.offeringsError = new Error('offerings unavailable');
            await renderDifficultyRoute();
            expect(await screen.findByRole('button', { name: /^Medium, locked/ })).toBeTruthy();
            expect(screen.queryByRole('button', { name: /^Medium, locked.*\d/ })).toBeNull();
            expect(screen.queryByText(/\$\s?5/)).toBeNull();
        });

        it('opens the paywall with the price on selecting a locked bank, records paywall_viewed exactly once, and does not start a round', async () => {
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            expect(
                within(dialog).getByText(new RegExp(NATIVE_PRICES[MEDIUM_PRODUCT])),
            ).toBeTruthy();
            await settle();
            expect(countPaywallViews()).toBe(1);
            expect(mockTrackEvent.mock.calls.find(([name]) => name === 'paywall_viewed')?.[0]).toBe(
                'paywall_viewed',
            );
            expect(listNavigatedUrls().map(({ pathname }) => pathname)).not.toContain(
                '/python/medium',
            );
        });

        it('opens the paywall for the bank named by the paywall param (the return from sign-in)', async () => {
            mockParams.current = { language: 'python', paywall: 'medium' };
            await renderDifficultyRoute();
            const dialog = await screen.findByRole('dialog');
            expect(
                within(dialog).getByText(new RegExp(NATIVE_PRICES[MEDIUM_PRODUCT])),
            ).toBeTruthy();
            await settle();
            expect(countPaywallViews()).toBe(1);
        });

        it.each([
            ['a free bank', 'easy'],
            ['an unknown bank', 'platinum'],
            ['markup', '<script>alert(1)</script>'],
            ['a path', '../hard'],
            ['an oversized value', 'm'.repeat(10_000)],
        ])('opens no paywall when the paywall param names %s', async (_label, value) => {
            mockParams.current = { language: 'python', paywall: value };
            await renderDifficultyRoute();
            await screen.findByRole('button', { name: MEDIUM_LOCKED });
            await settle();
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(countPaywallViews()).toBe(0);
        });

        it('Buy purchases the bank package through purchasePackage, then refetches GET me, and unlocks once the server lists the entitlement', async () => {
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            const meBefore = countMeRequests();
            await pressBuy(dialog);
            expect(nativeSdk.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
            await waitFor(() => expectMediumUnlocked());
            expect(countMeRequests()).toBeGreaterThan(meBefore);
            const purchaseAt = fakeServer.events.indexOf(`purchasePackage ${MEDIUM_PRODUCT}`);
            expect(fakeServer.events.slice(purchaseAt + 1)).toContain('GET me');
            // Only the bought bank unlocks.
            expect(screen.getByRole('button', { name: HARD_LOCKED, ...HIDDEN })).toBeTruthy();
        });

        it.each([
            ['cancelled', 'cancel'],
            ['failed', 'fail'],
        ] as const)('a %s purchase unlocks nothing', async (_label, behavior) => {
            nativeSdk.purchaseBehavior = behavior;
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            await pressBuy(dialog);
            expect(nativeSdk.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
            await settle();
            expect(screen.getByRole('button', { name: MEDIUM_LOCKED, ...HIDDEN })).toBeTruthy();
            expect(screen.getByRole('button', { name: HARD_LOCKED, ...HIDDEN })).toBeTruthy();
            expect(fakeServer.entitlements).toEqual([]);
        });

        it('security boundary: a successful purchasePackage whose GET me refetch still lacks the entitlement leaves the bank locked', async () => {
            nativeSdk.purchaseBehavior = 'no-grant';
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            const meBefore = countMeRequests();
            await pressBuy(dialog);
            expect(nativeSdk.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
            // The client asked the server, and the server said no.
            await waitFor(() => expect(countMeRequests()).toBeGreaterThan(meBefore));
            await settle();
            expect(screen.getByRole('button', { name: MEDIUM_LOCKED, ...HIDDEN })).toBeTruthy();
            expect(screen.getByRole('button', { name: HARD_LOCKED, ...HIDDEN })).toBeTruthy();
        });
    });

    describe('a guest', () => {
        beforeEach(() => {
            fakeAuth.userId = null;
            serveApp();
        });

        it('selecting a paid bank goes to sign-in first, with a return to that bank paywall, and opens no paywall', async () => {
            await renderDifficultyRoute();
            await fireEvent.press(await screen.findByRole('button', { name: /^Medium, locked/ }));
            await settle();
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(countPaywallViews()).toBe(0);
            expect(nativeSdk.purchasedProductIds).toEqual([]);
            const signIn = listNavigatedUrls().find(({ pathname }) => pathname === '/sign-in');
            expect(signIn).toBeDefined();
            const returnTo = toUrl(signIn?.searchParams.get('returnTo') ?? '');
            expect(returnTo.pathname).toBe('/python');
            expect(returnTo.searchParams.get('paywall')).toBe('medium');
        });
    });

    describe('offline (Review Focus 3)', () => {
        beforeEach(() => {
            fakeAuth.userId = SIGNED_IN_USER;
            mockIsOnline.current = false;
            // No local copy of python medium; its download fails like an offline request.
            serveApp({ hasLocalMedium: false });
        });

        it('a bank owned per the last GET me with no local copy says "Needs a connection", not locked, and opens no paywall', async () => {
            fakeServer.entitlements = [MEDIUM_PRODUCT];
            await renderDifficultyRoute();
            await waitFor(() => expect(countMeRequests()).toBeGreaterThan(0));
            await settle();
            const medium = screen.getByRole('button', { name: /^Medium\b/ });
            expect(within(medium).getByText(/Needs a connection/)).toBeTruthy();
            expect(screen.queryByRole('button', { name: /^Medium, locked/ })).toBeNull();
            expect(screen.queryByText(NATIVE_PRICES[MEDIUM_PRODUCT])).toBeNull();
            await fireEvent.press(medium);
            await settle();
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(countPaywallViews()).toBe(0);
            expect(nativeSdk.purchasedProductIds).toEqual([]);
        });
    });
});
