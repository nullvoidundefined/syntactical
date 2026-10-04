// AuthProvider keeps the analytics identity in step with sign-in (B-45): a
// successful sign-in identifies the server user id (never the email), a stored
// signed-in user is identified on hydrate, sign-out resets, and a guest never
// identifies.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { AuthProvider, useAuth } from '../AuthProvider';
import { buildIdentity, installRoutedFetch } from './authTestSupport';

const mockIdentify = jest.fn();
const mockReset = jest.fn();
jest.mock('../../clients/analyticsClient', () => ({
    identifyAnalyticsUser: (...args: unknown[]) => mockIdentify(...args),
    resetAnalyticsUser: () => mockReset(),
    trackEvent: jest.fn(),
}));
jest.mock('expo-constants', () => ({
    expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
    deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

async function mountAuth() {
    const rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
    return rendered;
}

beforeEach(async () => {
    await AsyncStorage.clear();
});

describe('AuthProvider analytics identity', () => {
    it('identifies the user id after sign-in, resets after sign-out, and never passes the email', async () => {
        const identity = buildIdentity();
        installRoutedFetch({
            'POST auth/sessions': {
                status: 201,
                body: { data: { token: identity.sessionValue, userId: identity.userId } },
            },
            'DELETE auth/sessions/current': { status: 204 },
        });
        const { result } = await mountAuth();
        expect(mockIdentify).not.toHaveBeenCalled();
        await act(async () => {
            await result.current.verifyCode(identity.email, identity.code);
        });
        expect(mockIdentify).toHaveBeenCalledTimes(1);
        expect(mockIdentify).toHaveBeenCalledWith(identity.userId);
        expect(JSON.stringify(mockIdentify.mock.calls)).not.toContain(identity.email);
        expect(mockReset).not.toHaveBeenCalled();
        await act(async () => {
            await result.current.signOut();
        });
        expect(mockReset).toHaveBeenCalledTimes(1);
    });

    it('identifies a stored signed-in user on hydrate', async () => {
        const userId = randomUUID();
        await AsyncStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({ knownUserIds: [userId], userId }),
        );
        await mountAuth();
        expect(mockIdentify).toHaveBeenCalledWith(userId);
    });

    it('does not identify a guest', async () => {
        await mountAuth();
        expect(mockIdentify).not.toHaveBeenCalled();
        expect(mockReset).not.toHaveBeenCalled();
    });

    it('does not identify after a failed sign-in', async () => {
        const identity = buildIdentity();
        installRoutedFetch({ 'POST auth/sessions': { status: 400 } });
        const { result } = await mountAuth();
        await act(async () => {
            await result.current.verifyCode(identity.email, identity.code);
        });
        expect(mockIdentify).not.toHaveBeenCalled();
    });
});
