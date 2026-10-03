// AuthProvider session integrity on web: the cookie carries the session, so
// only the provider can tell a 401 for a request sent before the current
// sign-in (ignored) from a 401 for one sent under the current session (signs
// out). The real apiFetch runs against a routed fetch stand-in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react';

import { apiFetch } from '../../clients/apiClient';
import { AuthProvider, useAuth } from '../AuthProvider';
import {
  buildIdentity,
  holdReply,
  installRoutedFetch,
  readStoredAuth,
  type FakeReply,
} from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const UNAUTHORIZED: FakeReply = {
  status: 401,
  body: { error: { code: 'AUTH_SESSION_REQUIRED', message: 'session required', requestId: 'r1' } },
};

async function mountAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true));
  return rendered;
}

async function flush() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('AuthProvider session integrity on web', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps a new user signed in when a request sent before sign-in returns 401 afterwards', async () => {
    const identity = buildIdentity();
    const held = holdReply();
    const { requests } = installRoutedFetch({
      'POST auth/sessions': { status: 201, body: { data: { userId: identity.userId } } },
      'GET answer-events': held,
    });
    const { result } = await mountAuth();

    let stale: Promise<unknown> = Promise.resolve();
    await act(async () => {
      stale = apiFetch('answer-events').catch(() => undefined);
    });
    await waitFor(() => expect(requests.some((request) => request.path === 'answer-events')).toBe(true));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.verifyCode(identity.email, identity.code);
    });
    expect(outcome).toEqual({ isOk: true });
    await act(async () => {
      held.release(UNAUTHORIZED);
      await stale;
    });
    await flush();

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.user).toEqual({ id: identity.userId });
    expect((await readStoredAuth())?.userId).toBe(identity.userId);
  });

  it('still signs out when a request sent under the current session returns 401', async () => {
    const identity = buildIdentity();
    const held = holdReply();
    const { requests } = installRoutedFetch({
      'POST auth/sessions': { status: 201, body: { data: { userId: identity.userId } } },
      'GET answer-events': held,
    });
    const { result } = await mountAuth();
    await act(async () => {
      await result.current.verifyCode(identity.email, identity.code);
    });
    expect(result.current.isSignedIn).toBe(true);

    let current: Promise<unknown> = Promise.resolve();
    await act(async () => {
      current = apiFetch('answer-events').catch(() => undefined);
    });
    await waitFor(() => expect(requests.some((request) => request.path === 'answer-events')).toBe(true));
    await act(async () => {
      held.release(UNAUTHORIZED);
      await current;
    });

    await waitFor(() => expect(result.current.isSignedIn).toBe(false));
    expect(result.current.user).toBeNull();
    await waitFor(async () => expect((await readStoredAuth())?.userId ?? null).toBeNull());
  });
});
