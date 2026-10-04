// Task 3.18 RED (B-43) on the web: "Restore purchases" is native only. Web
// Billing purchases are tied to the signed-in account, so Settings on the web
// shows no restore control. A guard: it passes before and after Task 3.18.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import {
    SIGNED_IN_USER,
    fakeAuth,
    resetFakes,
    serveApp,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import SettingsScreen from '../settings';

jest.mock('expo-constants', () => ({
    expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));
jest.mock('../../clients/webBillingClient', () =>
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildWebBillingModule(),
);
jest.mock('../../state/AuthProvider', () =>
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('expo-router', () =>
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildRouterModule(() => ({})),
);
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

beforeEach(() => {
    resetFakes();
    fakeAuth.userId = SIGNED_IN_USER;
    serveApp();
});

describe('Settings on the web', () => {
    it('shows no "Restore purchases" control to a signed-in user', () => {
        render(
            <QueryClientProvider client={createQueryClient()}>
                <SettingsScreen />
            </QueryClientProvider>,
        );
        expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /restore purchases/i })).toBeNull();
        expect(screen.queryByText(/restore purchases/i)).toBeNull();
    });
});
