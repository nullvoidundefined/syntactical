// The Settings password form on the web (Task 7.9; B-64, B-86, B-88). The real SettingsScreen,
// AuthProvider, StatsProvider, query client, and apiFetch run against a routed fetch stand-in:
// - /settings?form=password (where "Forgot password?" lands after a code sign-in) moves focus to
//   the form's first field: the current password for "Change password", the new password for
//   "Add a password"; without the param focus stays where it was;
// - the page keeps one h1, and the form is one <form> whose only submit button is "Save password";
// - from that landing, a fresh code session saves a new password with the current one left empty.
// Values are built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  CURRENT_LABEL,
  NEW_LABEL,
  PASSWORD_ROUTE,
  PROFILE_ROUTE,
  SAVED_MESSAGE,
  SAVE_BUTTON,
  buildPassword,
  profileReply,
  savedReply,
} from '../../components/auth/__tests__/passwordSettingsTestSupport';
import { createQueryClient } from '../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  buildIdentity,
  installRoutedFetch,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../state/AuthProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import SettingsScreen from '../settings';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../state/SyncProvider', () => ({
  useSync: () => ({
    cancelPass: () => undefined,
    isSyncing: false,
    isUploadCapReached: false,
    syncNow: () => Promise.resolve(true),
  }),
}));
jest.mock('../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('@react-native-community/netinfo', () => {
  const api = {
    addEventListener: (listener: (value: { isConnected: boolean }) => void) => {
      listener({ isConnected: true });
      return () => undefined;
    },
    fetch: () => Promise.resolve({ isConnected: true }),
  };
  return { __esModule: true, default: api, ...api };
});

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
jest.mock('expo-router', () => {
  const router = {
    back: () => undefined,
    dismissTo: () => undefined,
    navigate: () => undefined,
    push: () => undefined,
    replace: () => undefined,
  };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => mockParams.current,
    useLocalSearchParams: () => mockParams.current,
    useRouter: () => router,
  };
});

async function renderSignedInSettings(identity: SignInIdentity) {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  const rendered = render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <OwnedStatsProvider>
          <SettingsScreen />
        </OwnedStatsProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByLabelText(NEW_LABEL, { selector: 'input' });
  return rendered;
}

function getCurrentInput(): HTMLInputElement {
  return screen.getByLabelText(CURRENT_LABEL, { selector: 'input' }) as HTMLInputElement;
}

function getNewInput(): HTMLInputElement {
  return screen.getByLabelText(NEW_LABEL, { selector: 'input' }) as HTMLInputElement;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockParams.current = {};
});

describe('Settings password form on the web', () => {
  it('moves focus to the current-password input for /settings?form=password when the form is "Change password"', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, true) });
    mockParams.current = { form: 'password' };
    await renderSignedInSettings(identity);
    await waitFor(() => expect(document.activeElement).toBe(getCurrentInput()));
  });

  it('moves focus to the new-password input for /settings?form=password when the form is "Add a password"', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, false) });
    mockParams.current = { form: 'password' };
    await renderSignedInSettings(identity);
    await waitFor(() => expect(document.activeElement).toBe(getNewInput()));
  });

  it('leaves focus alone without the form param', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, true) });
    await renderSignedInSettings(identity);
    await act(async () => undefined);
    expect(document.activeElement).not.toBe(getCurrentInput());
    expect(document.activeElement).not.toBe(getNewInput());
  });

  it('keeps one h1 on the page and one form whose only submit button is "Save password"', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, true) });
    await renderSignedInSettings(identity);
    const levelOne = document.querySelectorAll('h1, [role="heading"][aria-level="1"]');
    expect(levelOne).toHaveLength(1);
    expect(levelOne[0].textContent).toBe('Settings');
    const forms = document.querySelectorAll('form');
    expect(forms).toHaveLength(1);
    expect(forms[0].contains(getCurrentInput())).toBe(true);
    const submitButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.type === 'submit');
    expect(submitButtons).toEqual([screen.getByRole('button', { name: SAVE_BUTTON })]);
  });

  it('after "Forgot password?" lands here, saves a new password with the current one left empty, by keyboard alone', async () => {
    const identity = buildIdentity();
    const next = buildPassword();
    const { requests } = installRoutedFetch({
      [PASSWORD_ROUTE]: savedReply(),
      [PROFILE_ROUTE]: profileReply(identity.email, true),
    });
    mockParams.current = { form: 'password' };
    await renderSignedInSettings(identity);
    await waitFor(() => expect(document.activeElement).toBe(getCurrentInput()));
    act(() => getNewInput().focus());
    fireEvent.change(getNewInput(), { target: { value: next } });
    await act(async () => {
      const isNotPrevented = fireEvent.keyDown(getNewInput(), { key: 'Enter', code: 'Enter' });
      const { form } = getNewInput();
      if (isNotPrevented && form !== null) fireEvent.submit(form);
    });
    await screen.findByText(SAVED_MESSAGE);
    const sent = requests.filter((request) => request.method === 'PUT' && request.path === 'me/password');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ newPassword: next });
    expect(sent[0].headers['x-requested-with']).toBe('XMLHttpRequest');
  });
});
