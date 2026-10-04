// Settings restore messages on native (IAN-601): a restore whose store call and
// GET me both succeed says "Purchases restored."; a restore the store rejects
// says "Restore failed. Check your connection and try again." Neither message
// shows before the button is pressed.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import '../../components/auth/__tests__/preloadNativeModal';
import {
    SIGNED_IN_USER,
    fakeAuth,
    nativeSdk,
    resetFakes,
    serveApp,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import SettingsScreen from '../settings';

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };

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
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const RESTORED = 'Purchases restored.';
const RESTORE_FAILED = 'Restore failed. Check your connection and try again.';

let queryClient: QueryClient;

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

async function renderSettings(): Promise<void> {
    await render(
        <QueryClientProvider client={queryClient}>
            <SettingsScreen />
        </QueryClientProvider>,
    );
    await settle();
}

async function pressRestore(): Promise<void> {
    await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
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

describe('Restore purchases messages in Settings on native', () => {
    it('says "Purchases restored." after a successful restore', async () => {
        await renderSettings();
        expect(screen.queryByText(RESTORED)).toBeNull();
        expect(screen.queryByText(RESTORE_FAILED)).toBeNull();

        await pressRestore();

        expect(nativeSdk.restoreCount).toBe(1);
        expect(await screen.findByText(RESTORED)).toBeTruthy();
        expect(screen.queryByText(RESTORE_FAILED)).toBeNull();
    });

    it('says "Restore failed." when the store rejects the restore', async () => {
        nativeSdk.restoreBehavior = 'fail';
        await renderSettings();

        await pressRestore();

        expect(nativeSdk.restoreCount).toBe(1);
        expect(await screen.findByText(RESTORE_FAILED)).toBeTruthy();
        expect(screen.queryByText(RESTORED)).toBeNull();
    });
});
