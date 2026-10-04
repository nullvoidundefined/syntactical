// Task 3.18 RED (B-43) on native: Settings offers "Restore purchases" to a
// signed-in user; it calls react-native-purchases' restorePurchases, then
// GET me, and every bank the server now lists unlocks (shown here on the
// difficulty route sharing the same query client). A failed restore unlocks
// nothing. The SDK's own restore result never unlocks: the server is the only
// source of entitlements.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
    CONTENT_BASE_URL,
    SIGNED_IN_USER,
    countMeRequests,
    fakeAuth,
    fakeServer,
    nativeSdk,
    resetFakes,
    serveApp,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import DifficultyScreen from '../[language]/index';
import SettingsScreen from '../settings';

const mockParams: { current: Record<string, string | string[] | undefined> } = {
    current: { language: 'python' },
};

jest.mock('expo-constants', () => {
    // Built at run time so no credential-shaped literal sits in source.
    const { randomBytes } = require('node:crypto');
    return {
        expoConfig: {
            extra: {
                apiBaseUrl: 'https://api.syntactical.dev/v1/',
                contentBaseUrl: 'https://example.test/content/',
                revenueCatAppleKey: `appl_${randomBytes(12).toString('hex')}`,
                revenueCatGoogleKey: `goog_${randomBytes(12).toString('hex')}`,
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
jest.mock('../../state/StatsProvider', () => ({
    useQuizStats: () => ({ setDailyGoal: () => undefined }),
}));
jest.mock('../../state/useProfile', () => ({
    useProfile: () => ({ snapshot: null, updateDailyGoal: () => Promise.resolve(true) }),
}));
jest.mock('../../state/useProgressSummary', () => ({
    useProgressSummary: () => ({ dailyGoal: 20 }),
}));
jest.mock('../../components/auth/SignOutDialog', () => ({ SignOutDialog: () => null }));
jest.mock('../../components/auth/DeleteAccountDialog', () => ({ DeleteAccountDialog: () => null }));
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }), {
    virtual: true,
});

let queryClient: QueryClient;

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

async function renderSettingsWithDifficulty(): Promise<void> {
    await render(
        <QueryClientProvider client={queryClient}>
            <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
                <SettingsScreen />
                <DifficultyScreen />
            </ContentProvider>
        </QueryClientProvider>,
    );
    await settle();
}

beforeEach(() => {
    resetFakes();
    queryClient = createQueryClient();
    fakeAuth.userId = SIGNED_IN_USER;
    serveApp();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
});

describe('Restore purchases in Settings on native', () => {
    it('calls restorePurchases, then GET me, and unlocks every bank the server lists', async () => {
        await renderSettingsWithDifficulty();
        expect(await screen.findByRole('button', { name: /^Medium, locked/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Hard, locked/ })).toBeTruthy();
        const meBefore = countMeRequests();

        await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
        await settle();

        expect(nativeSdk.restoreCount).toBe(1);
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /^Medium, locked/ })).toBeNull();
            expect(screen.queryByRole('button', { name: /^Hard, locked/ })).toBeNull();
        });
        expect(screen.getByRole('button', { name: /^Medium\b/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Hard\b/ })).toBeTruthy();
        expect(countMeRequests()).toBeGreaterThan(meBefore);
        const restoreAt = fakeServer.events.indexOf('restorePurchases');
        expect(fakeServer.events.slice(restoreAt + 1)).toContain('GET me');
    });

    it('a failed restore unlocks nothing', async () => {
        nativeSdk.restoreBehavior = 'fail';
        await renderSettingsWithDifficulty();
        expect(await screen.findByRole('button', { name: /^Medium, locked/ })).toBeTruthy();

        await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
        await settle();

        expect(nativeSdk.restoreCount).toBe(1);
        expect(screen.getByRole('button', { name: /^Medium, locked/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Hard, locked/ })).toBeTruthy();
    });
});
