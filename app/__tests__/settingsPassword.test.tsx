// The Settings password form on native (Task 7.9; B-88, B-90). The real SettingsScreen,
// AuthProvider, StatsProvider, query client, and apiFetch run against a routed fetch stand-in:
// - the account section of a signed-in user shows "Add a password" when GET me says hasPassword
//   false and "Change password" when true; a guest sees neither; the page keeps one h1;
// - the inline code steps use the email from GET me;
// - neither password reaches AsyncStorage, SecureStore, logWarning, analytics, the purchaser, the
//   console, or a navigation across a refusal, a reauth, a code sign-in, a save, and leaving;
// - leaving Settings clears both fields and the code steps.
// Every value is built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  ADD_HEADING,
  CHANGE_HEADING,
  CODES_ROUTE,
  CODE_LABEL,
  CURRENT_LABEL,
  NEW_LABEL,
  PASSWORD_ROUTE,
  PROFILE_ROUTE,
  SAVED_MESSAGE,
  SAVE_BUTTON,
  SEND_CODE_BUTTON,
  SESSIONS_ROUTE,
  USE_CODE_BUTTON,
  VERIFY_BUTTON,
  buildPassword,
  codeSentReply,
  errorReply,
  profileReply,
  savedReply,
  sessionReply,
} from '../../components/auth/__tests__/passwordSettingsTestSupport';
import { createQueryClient } from '../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  captureConsole,
  installRoutedFetch,
  readAllStoredValues,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../state/AuthProvider';
import { OwnedStatsProvider } from '../../state/OwnedStatsProvider';
import SettingsScreen from '../settings';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    mockValues: values,
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  };
});

const mockIdentifyPurchaser = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockResetPurchaser = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('../../clients/purchasesIdentity', () => ({
  identifyPurchaser: (...args: unknown[]) => mockIdentifyPurchaser(...args),
  resetPurchaser: (...args: unknown[]) => mockResetPurchaser(...args),
}));

const mockIdentifyAnalytics = jest.fn();
const mockResetAnalytics = jest.fn();
const mockTrackEvent = jest.fn();
jest.mock('../../clients/analyticsClient', () => ({
  identifyAnalyticsUser: (...args: unknown[]) => mockIdentifyAnalytics(...args),
  resetAnalyticsUser: (...args: unknown[]) => mockResetAnalytics(...args),
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

// The real logWarning still runs (it writes to console.warn), and every call is recorded.
const mockLogWarning = jest.fn();
jest.mock('../../clients/logClient', () => {
  const actual = jest.requireActual('../../clients/logClient');
  return {
    ...actual,
    logWarning: (...args: unknown[]) => {
      mockLogWarning(...args);
      return actual.logWarning(...args);
    },
  };
});

jest.mock('../../state/SyncProvider', () => ({
  useSync: () => ({
    cancelPass: () => undefined,
    isSyncing: false,
    isUploadCapReached: false,
    syncNow: () => Promise.resolve(true),
  }),
}));

const mockNavigations: unknown[] = [];
jest.mock('expo-router', () => {
  function record(href: unknown) {
    mockNavigations.push(href);
  }
  const router = { back: () => undefined, dismissTo: record, navigate: record, push: record, replace: record };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => ({}),
    useLocalSearchParams: () => ({}),
    useRouter: () => router,
  };
});

type SecureStoreMock = { mockValues: Map<string, string>; setItemAsync: jest.Mock };
const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

function listHeadings(): { level: unknown; text: string }[] {
  return screen.getAllByRole('heading').map((heading) => ({
    level: heading.props['aria-level'] ?? heading.props.accessibilityLevel,
    text: String(heading.props.children),
  }));
}

function listInputValues(): string[] {
  return screen.container
    .queryAll((node) => typeof node.props?.value === 'string')
    .map((node) => node.props.value as string);
}

async function signIn(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
}

async function renderSettings() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <OwnedStatsProvider>
          <SettingsScreen />
        </OwnedStatsProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function renderSignedInSettings(identity: SignInIdentity) {
  await signIn(identity);
  const rendered = await renderSettings();
  await screen.findByLabelText(NEW_LABEL);
  return rendered;
}

// The code steps send the code to the signed-in email either as they open or on "Send code".
async function reachCodeField(): Promise<void> {
  await waitFor(() =>
    expect(
      screen.queryByLabelText(CODE_LABEL) ?? screen.queryByRole('button', { name: SEND_CODE_BUTTON }),
    ).toBeTruthy(),
  );
  const sendButton = screen.queryByRole('button', { name: SEND_CODE_BUTTON });
  if (sendButton !== null) await fireEvent.press(sendButton);
  await screen.findByLabelText(CODE_LABEL);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  mockNavigations.length = 0;
});

describe('Settings password form', () => {
  it('shows "Add a password" with one new-password field when GET me says hasPassword false', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, false) });
    await renderSignedInSettings(identity);
    const texts = listHeadings().map(({ text }) => text);
    expect(texts).toContain(ADD_HEADING);
    expect(texts).not.toContain(CHANGE_HEADING);
    expect(screen.queryByLabelText(CURRENT_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: SAVE_BUTTON })).toBeTruthy();
  });

  it('shows "Change password" with a current-password and a new-password field when GET me says hasPassword true', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, true) });
    await renderSignedInSettings(identity);
    const texts = listHeadings().map(({ text }) => text);
    expect(texts).toContain(CHANGE_HEADING);
    expect(texts).not.toContain(ADD_HEADING);
    expect(screen.getByLabelText(CURRENT_LABEL).props.autoComplete).toBe('current-password');
    expect(screen.getByLabelText(NEW_LABEL).props.autoComplete).toBe('new-password');
    expect(screen.getByRole('button', { name: USE_CODE_BUTTON })).toBeTruthy();
  });

  it('keeps one h1 "Settings", with the form heading below level 1', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, true) });
    await renderSignedInSettings(identity);
    const headings = listHeadings();
    expect(headings.filter(({ level }) => level === 1).map(({ text }) => text)).toEqual(['Settings']);
    const formHeading = headings.find(({ text }) => text === CHANGE_HEADING);
    expect(formHeading).toBeDefined();
    expect(Number(formHeading?.level)).toBeGreaterThan(1);
  });

  it('shows a guest no password form', async () => {
    installRoutedFetch({});
    await renderSettings();
    await screen.findByRole('link', { name: 'Sign in' });
    const texts = listHeadings().map(({ text }) => text);
    expect(texts).not.toContain(ADD_HEADING);
    expect(texts).not.toContain(CHANGE_HEADING);
    expect(screen.queryByLabelText(NEW_LABEL)).toBeNull();
  });

  it('runs the inline code steps for the email GET me returns', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PROFILE_ROUTE]: profileReply(identity.email, true),
    });
    await renderSignedInSettings(identity);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE_BUTTON }));
    await reachCodeField();
    const codeRequests = requests.filter((request) => request.path === 'auth/codes');
    expect(codeRequests).toHaveLength(1);
    expect(codeRequests[0].body).toEqual({ email: identity.email });
  });
});

describe('Settings password form keeps passwords in memory only (B-90)', () => {
  function serialiseCalls(mock: jest.Mock): string {
    return JSON.stringify(mock.mock.calls);
  }

  it('reaches no AsyncStorage, SecureStore, logWarning, analytics, purchaser, console, or navigation across a refusal, a reauth, a code sign-in, a save, and leaving', async () => {
    const identity = buildIdentity();
    const reauthed = buildIdentity();
    const current = buildPassword();
    const next = buildPassword();
    const consoleCapture = captureConsole();
    // The AsyncStorage jest mock's methods are already jest.fn, so jest.spyOn would hand back the
    // same mock and mockRestore would strip its implementation for later tests. Each write method
    // is wrapped in a recording pass-through instead, and the saved original is put back after.
    const storage = AsyncStorage as unknown as Record<string, (...args: unknown[]) => unknown>;
    const writeMethods = ['setItem', 'multiSet', 'mergeItem', 'multiMerge'];
    const originals = writeMethods.map((name) => storage[name]);
    const storageSpies = writeMethods.map((name, index) => {
      const spy = jest.fn((...args: unknown[]) => originals[index](...args));
      storage[name] = spy;
      return spy;
    });
    try {
      const { requests } = installRoutedFetch({
        [CODES_ROUTE]: codeSentReply(),
        [PASSWORD_ROUTE]: [
          errorReply(400, 'AUTH_INVALID_CREDENTIALS'),
          errorReply(403, 'AUTH_REAUTH_REQUIRED'),
          savedReply(),
        ],
        [PROFILE_ROUTE]: profileReply(identity.email, true),
        [SESSIONS_ROUTE]: sessionReply({ ...reauthed, userId: identity.userId }),
      });
      await signIn(identity);
      secureStore.setItemAsync.mockClear();
      const rendered = await renderSettings();
      await screen.findByLabelText(NEW_LABEL);

      // A wrong current password, then a save with it emptied that needs a fresh code sign-in.
      await fireEvent.changeText(screen.getByLabelText(CURRENT_LABEL), current);
      await fireEvent.changeText(screen.getByLabelText(NEW_LABEL), next);
      await fireEvent.press(screen.getByRole('button', { name: SAVE_BUTTON }));
      await screen.findByRole('alert');
      await fireEvent.changeText(screen.getByLabelText(CURRENT_LABEL), '');
      await fireEvent.press(screen.getByRole('button', { name: SAVE_BUTTON }));
      await reachCodeField();
      await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), identity.code);
      await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
      await waitFor(() => expect(screen.getByLabelText(NEW_LABEL).props.value).toBe(next));
      await fireEvent.press(screen.getByRole('button', { name: SAVE_BUTTON }));
      await screen.findByText(SAVED_MESSAGE);

      await rendered.unmount();
      await act(async () => undefined);

      // Control: the passwords did travel, in PUT me/password bodies and nowhere else.
      const passwordRequests = requests.filter((request) => request.path === 'me/password');
      expect(passwordRequests).toHaveLength(3);
      expect(passwordRequests[0].body).toEqual({ currentPassword: current, newPassword: next });
      expect(passwordRequests[1].body).toEqual({ newPassword: next });
      expect(passwordRequests[2].body).toEqual({ newPassword: next });
      const otherRequests = JSON.stringify(requests.filter((request) => request.path !== 'me/password'));

      for (const value of [current, next]) {
        expect(otherRequests).not.toContain(value);
        for (const spy of storageSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(value);
        expect((await readAllStoredValues()).join('\n')).not.toContain(value);
        expect(serialiseCalls(secureStore.setItemAsync)).not.toContain(value);
        expect(serialiseCalls(mockLogWarning)).not.toContain(value);
        expect(serialiseCalls(mockIdentifyAnalytics)).not.toContain(value);
        expect(serialiseCalls(mockResetAnalytics)).not.toContain(value);
        expect(serialiseCalls(mockTrackEvent)).not.toContain(value);
        expect(serialiseCalls(mockIdentifyPurchaser)).not.toContain(value);
        expect(serialiseCalls(mockResetPurchaser)).not.toContain(value);
        expect(consoleCapture.serialised()).not.toContain(value);
        expect(JSON.stringify(mockNavigations)).not.toContain(value);
      }
      expect(secureStore.setItemAsync.mock.calls).toEqual([[SESSION_TOKEN_KEY, reauthed.sessionValue]]);
    } finally {
      writeMethods.forEach((name, index) => {
        storage[name] = originals[index];
      });
      consoleCapture.restore();
    }
  });

  it('clears both fields when Settings is left: a new visit shows the form empty', async () => {
    const identity = buildIdentity();
    const current = buildPassword();
    const next = buildPassword();
    installRoutedFetch({ [PROFILE_ROUTE]: profileReply(identity.email, true) });
    const first = await renderSignedInSettings(identity);
    await fireEvent.changeText(screen.getByLabelText(CURRENT_LABEL), current);
    await fireEvent.changeText(screen.getByLabelText(NEW_LABEL), next);
    await first.unmount();
    await act(async () => undefined);

    await renderSettings();
    await screen.findByLabelText(NEW_LABEL);
    expect(screen.getByLabelText(CURRENT_LABEL).props.value).toBe('');
    expect(screen.getByLabelText(NEW_LABEL).props.value).toBe('');
    expect(listInputValues()).not.toContain(current);
    expect(listInputValues()).not.toContain(next);
  });

  it('clears the code steps and the new password when Settings is left from the code steps', async () => {
    const identity = buildIdentity();
    const next = buildPassword();
    installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PROFILE_ROUTE]: profileReply(identity.email, true),
    });
    const first = await renderSignedInSettings(identity);
    await fireEvent.changeText(screen.getByLabelText(NEW_LABEL), next);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE_BUTTON }));
    await reachCodeField();
    await first.unmount();
    await act(async () => undefined);

    await renderSettings();
    await screen.findByLabelText(NEW_LABEL);
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.getByLabelText(NEW_LABEL).props.value).toBe('');
    expect(listInputValues()).not.toContain(next);
  });
});
