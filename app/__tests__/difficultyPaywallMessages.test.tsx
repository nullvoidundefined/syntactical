// Paywall purchase messages on native (IAN-601): a purchase the store fails
// shows "The purchase did not go through. Try again."; a purchase the store
// completes while GET me does not yet list the entitlement shows "Your purchase
// is still processing. Check back shortly." A cancelled purchase shows neither.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
    CONTENT_BASE_URL,
    MEDIUM_PRODUCT,
    NATIVE_PRICES,
    SIGNED_IN_USER,
    fakeAuth,
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
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const MEDIUM_LOCKED = `Medium, locked, ${NATIVE_PRICES[MEDIUM_PRODUCT]}`;
const PURCHASE_FAILED = 'The purchase did not go through. Try again.';
const PURCHASE_PENDING = 'Your purchase is still processing. Check back shortly.';

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

// Opens the medium paywall, presses Buy, and returns the still-open dialog.
async function buyMedium() {
    await fireEvent.press(await screen.findByRole('button', { name: MEDIUM_LOCKED }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(PURCHASE_FAILED)).toBeNull();
    expect(within(dialog).queryByText(PURCHASE_PENDING)).toBeNull();
    await fireEvent.press(within(dialog).getByRole('button', { name: /^Buy\b/ }));
    await settle();
    return screen.getByRole('dialog');
}

beforeEach(() => {
    resetFakes();
    queryClient = createQueryClient();
    mockParams.current = { language: 'python' };
    fakeAuth.userId = SIGNED_IN_USER;
    serveApp();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
});

describe('difficulty route paywall messages on native', () => {
    it('says the purchase did not go through after a failed purchase', async () => {
        nativeSdk.purchaseBehavior = 'fail';
        await renderDifficultyRoute();
        const dialog = await buyMedium();
        expect(nativeSdk.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
        expect(await within(dialog).findByText(PURCHASE_FAILED)).toBeTruthy();
        expect(within(dialog).queryByText(PURCHASE_PENDING)).toBeNull();
    });

    it('says the purchase is still processing when the purchase succeeds but GET me does not list the entitlement', async () => {
        nativeSdk.purchaseBehavior = 'no-grant';
        await renderDifficultyRoute();
        const dialog = await buyMedium();
        expect(nativeSdk.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
        expect(await within(dialog).findByText(PURCHASE_PENDING)).toBeTruthy();
        expect(within(dialog).queryByText(PURCHASE_FAILED)).toBeNull();
    });

    it('shows neither message after a cancelled purchase', async () => {
        nativeSdk.purchaseBehavior = 'cancel';
        await renderDifficultyRoute();
        const dialog = await buyMedium();
        expect(nativeSdk.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
        expect(within(dialog).queryByText(PURCHASE_FAILED)).toBeNull();
        expect(within(dialog).queryByText(PURCHASE_PENDING)).toBeNull();
    });
});
