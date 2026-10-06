// The sign-up route on native (Task 7.8; B-87, B-89, B-90). The real
// AuthProvider and the real apiFetch run against a routed fetch stand-in, so
// every assertion is on the HTTP contract and what the screen shows:
// - one h1 "Create an account", an email field, and a hidden new-password
//   field with the hint "At least 12 characters. Spaces are fine." tied to it;
// - the length is checked on device in code points after NFKC (11 refused with
//   no request, 12 sent to POST auth/signups, 129 refused with no request);
// - each server refusal of the first step is announced in one alert, never
//   echoes the email or the password, and keeps the password step;
// - the code goes to POST auth/signups/verify with the email and the same
//   password held in memory; isPasswordApplied true signs in and goes to a
//   safe returnTo (or /), false signs in and says the password was not changed;
// - "Resend code" posts auth/signups again with the same password and restarts
//   the cooldown;
// - the password reaches only those two request bodies: no storage, log,
//   analytics, purchaser, or console call; leaving the route clears it;
// - "Create an account" on sign-in forwards a safe returnTo to /sign-up, the
//   "Sign in" link on sign-up keeps it, and an unsafe one is dropped.
// Every value is built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  SESSION_TOKEN_KEY,
  buildIdentity,
  captureConsole,
  holdReply,
  installRoutedFetch,
  pinDeviceTimeZone,
  readAllStoredValues,
  type FakeReply,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import SignInScreen from '../sign-in';
import SignUpScreen from '../sign-up';

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

// Every navigation (push, navigate, or replace) lands in one list, so the
// tests pin where the user goes, not which router method took them there.
const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockNavigations: unknown[] = [];
jest.mock('expo-router', () => {
  function record(href: unknown) {
    mockNavigations.push(href);
  }
  const router = { back: () => undefined, dismissTo: record, navigate: record, push: record, replace: record };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => mockParams.current,
    useLocalSearchParams: () => mockParams.current,
    useRouter: () => router,
  };
});

type SecureStoreMock = {
  mockValues: Map<string, string>;
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const secureStore = jest.requireMock('expo-secure-store') as SecureStoreMock;

const SIGNUPS_ROUTE = 'POST auth/signups';
const VERIFY_ROUTE = 'POST auth/signups/verify';
const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const CODE_LABEL = 'Sign-in code';
const CREATE_ACCOUNT_BUTTON = 'Create account';
const CREATE_ACCOUNT_LINK = 'Create an account';
const VERIFY_BUTTON = 'Verify code';
const RESEND_BUTTON = 'Resend code';
const HINT = 'At least 12 characters. Spaces are fine.';
const ALREADY_HAD_ACCOUNT =
  'You already had an account, so we signed you in. Your password was not changed; you can set one in Settings.';
const RESEND_COOLDOWN_SECONDS = 60;
const SIGN_IN_LINK_NAME = /sign in/i;

const TOO_SHORT_MESSAGE = /at least 12 characters/i;
const TOO_LONG_MESSAGE = /128 characters/i;
const BREACHED_MESSAGE = /data breach/i;
const ANOTHER_PASSWORD = /(another|different) password/i;
const INVALID_EMAIL_MESSAGE = /email address does not look right/i;
const RATE_LIMITED_MESSAGE = /too many attempts/i;
const UNAVAILABLE_MESSAGE = /unavailable/i;
const INVALID_CODE_MESSAGE = /code did not work/i;

// A password of exactly `count` code points that is longer in UTF-16 units:
// three characters outside the Basic Multilingual Plane, a space, and hex
// letters, all unchanged by NFKC. It never starts or ends with the space.
function buildPasswordOfLength(count: number): string {
  const astral = () => String.fromCodePoint(0x1f600 + randomInt(0, 0x40));
  const hex = () => randomBytes(1).toString('hex')[0];
  const parts = [hex(), astral(), ' ', astral(), astral()];
  while (parts.length < count - 1) parts.push(hex());
  parts.push(hex());
  const password = parts.slice(0, count).join('');
  expect(Array.from(password.normalize('NFKC'))).toHaveLength(count);
  return password;
}

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function codeSentReply(): FakeReply {
  return { status: 202, body: { data: { status: 'code-sent' } } };
}

function errorReply(status: number, code: string): FakeReply {
  return { status, body: { error: { code, message: 'refused', requestId: 'r1' } } };
}

function verifiedReply(identity: SignInIdentity, isPasswordApplied: boolean): FakeReply {
  return {
    status: 201,
    body: { data: { isPasswordApplied, token: identity.sessionValue, userId: identity.userId } },
  };
}

function parseHref(href: unknown): { pathname: string; params: Record<string, string> } {
  if (typeof href === 'string') {
    const url = new URL(href, 'https://app.test');
    return { pathname: url.pathname, params: Object.fromEntries(url.searchParams.entries()) };
  }
  const { params = {}, pathname } = href as { params?: Record<string, string>; pathname: string };
  return { pathname, params: { ...params } };
}

function toHref(href: unknown): string {
  const { params, pathname } = parseHref(href);
  const query = new URLSearchParams(params).toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}

function listLevelOneHeadings(): string[] {
  return screen
    .getAllByRole('heading')
    .filter((heading) => heading.props['aria-level'] === 1 || heading.props.accessibilityLevel === 1)
    .map((heading) => String(heading.props.children));
}

function readDescribedByIds(element: ReturnType<typeof screen.getByLabelText>): string[] {
  const raw = element.props['aria-describedby'] ?? element.props.accessibilityDescribedBy ?? '';
  return String(raw)
    .split(/\s+/)
    .filter((id) => id !== '');
}

function readElementId(element: ReturnType<typeof screen.getByText>): string {
  const id = element.props.nativeID ?? element.props.id;
  expect(typeof id).toBe('string');
  expect(id).not.toBe('');
  return id as string;
}

// The id of the element that carries the alert: the alert region itself or the nearest ancestor with an id.
function readAlertId(alert: ReturnType<typeof screen.getByRole>): string {
  let node: ReturnType<typeof screen.getByRole> | null = alert;
  while (node !== null) {
    const id = node.props?.nativeID ?? node.props?.id;
    if (typeof id === 'string' && id !== '') return id;
    node = node.parent as ReturnType<typeof screen.getByRole> | null;
  }
  throw new Error('the alert region has no id');
}

function expectAlertOmits(alert: ReturnType<typeof screen.getByRole>, values: string[]): void {
  for (const value of values) {
    expect(within(alert).queryByText(new RegExp(escapeForRegExp(value)))).toBeNull();
  }
}

function SignedInProbe() {
  const { user } = useAuth();
  return <Text testID="signed-in-user">{user?.id ?? 'guest'}</Text>;
}

function readSignedInUser(): string {
  return String(screen.getByTestId('signed-in-user').props.children);
}

async function renderSignUp() {
  const rendered = await render(
    <AuthProvider>
      <SignUpScreen />
      <SignedInProbe />
    </AuthProvider>,
  );
  await screen.findByLabelText(EMAIL_LABEL);
  return rendered;
}

async function typeCredentials(email: string, password: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
}

async function submitCredentials(email: string, password: string): Promise<void> {
  await typeCredentials(email, password);
  await fireEvent.press(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON }));
}

async function reachCodeStep(email: string, password: string): Promise<void> {
  await submitCredentials(email, password);
  await screen.findByLabelText(CODE_LABEL);
}

async function submitCode(code: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
  await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
}

// One second per act, so a countdown built from chained timeouts re-renders between ticks.
async function advanceSeconds(seconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  mockParams.current = {};
  mockNavigations.length = 0;
});

describe('sign-up route, password step', () => {
  it('opens on one h1 "Create an account" with an email field and a hidden new-password field', async () => {
    installRoutedFetch({});
    await renderSignUp();
    expect(listLevelOneHeadings()).toEqual(['Create an account']);
    expect(screen.getByLabelText(EMAIL_LABEL)).toBeTruthy();
    const passwordInput = screen.getByLabelText(PASSWORD_LABEL);
    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoComplete).toBe('new-password');
    expect(passwordInput.props.textContentType).toBe('newPassword');
    expect(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON })).toBeTruthy();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the hint "At least 12 characters. Spaces are fine." tied to the password field by aria-describedby', async () => {
    installRoutedFetch({});
    await renderSignUp();
    const hintId = readElementId(screen.getByText(HINT));
    expect(readDescribedByIds(screen.getByLabelText(PASSWORD_LABEL))).toContain(hintId);
  });

  it('refuses an 11-code-point password on device: the too-short alert, no request, and the password step kept', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    const email = buildIdentity().email;
    const password = buildPasswordOfLength(11);
    expect(password.length).toBeGreaterThan(12);
    await renderSignUp();
    await submitCredentials(email, password);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(TOO_SHORT_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [email, password]);
    expect(requests.filter((request) => request.path.startsWith('auth/signups'))).toEqual([]);
    expect(screen.getByLabelText(PASSWORD_LABEL)).toBeTruthy();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
  });

  it('ties the too-short alert to the password field by aria-describedby, beside the hint', async () => {
    installRoutedFetch({});
    await renderSignUp();
    await submitCredentials(buildIdentity().email, buildPasswordOfLength(11));
    const alert = await screen.findByRole('alert');
    const ids = readDescribedByIds(screen.getByLabelText(PASSWORD_LABEL));
    expect(ids).toContain(readAlertId(alert));
    expect(ids).toContain(readElementId(screen.getByText(HINT)));
  });

  it('sends a 12-code-point password to POST auth/signups with the email and shows the code step', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    const email = buildIdentity().email;
    const password = buildPasswordOfLength(12);
    await renderSignUp();
    await reachCodeStep(email, password);
    const posted = requests.filter((request) => request.path === 'auth/signups');
    expect(posted).toHaveLength(1);
    expect(posted[0].method).toBe('POST');
    expect(posted[0].body).toEqual({ email, password });
    expect(screen.getByRole('button', { name: VERIFY_BUTTON })).toBeTruthy();
    expect(listLevelOneHeadings()).toEqual(['Create an account']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockNavigations).toEqual([]);
  });

  it('sends a 128-code-point password unchanged, spaces and all', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    const password = ` ${buildPasswordOfLength(126)} `;
    await renderSignUp();
    await reachCodeStep(buildIdentity().email, password);
    const posted = requests.filter((request) => request.path === 'auth/signups');
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toMatchObject({ password });
  });

  it('refuses an oversized password on device: the too-long alert, no request, and no echo of the value', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    const email = buildIdentity().email;
    const password = buildPasswordOfLength(129);
    await renderSignUp();
    await submitCredentials(email, password);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(TOO_LONG_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [email, password.slice(0, 20)]);
    expect(requests.filter((request) => request.path.startsWith('auth/signups'))).toEqual([]);
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
  });

  it.each([
    ['400 AUTH_PASSWORD_BREACHED', errorReply(400, 'AUTH_PASSWORD_BREACHED'), [BREACHED_MESSAGE, ANOTHER_PASSWORD]],
    ['400 AUTH_PASSWORD_TOO_SHORT', errorReply(400, 'AUTH_PASSWORD_TOO_SHORT'), [TOO_SHORT_MESSAGE]],
    ['400 AUTH_PASSWORD_TOO_LONG', errorReply(400, 'AUTH_PASSWORD_TOO_LONG'), [TOO_LONG_MESSAGE]],
    ['400 INPUT_INVALID_BODY', errorReply(400, 'INPUT_INVALID_BODY'), [INVALID_EMAIL_MESSAGE]],
    ['429 RATE_LIMIT_EXCEEDED', errorReply(429, 'RATE_LIMIT_EXCEEDED'), [RATE_LIMITED_MESSAGE]],
    ['503 SERVER_EMAIL_UNAVAILABLE', errorReply(503, 'SERVER_EMAIL_UNAVAILABLE'), [UNAVAILABLE_MESSAGE]],
    ['a network failure', 'reject' as const, [UNAVAILABLE_MESSAGE]],
  ])(
    'announces %s in one alert that echoes neither the email nor the password, and stays on the password step',
    async (_label, reply, messages) => {
      installRoutedFetch({ [SIGNUPS_ROUTE]: reply });
      const email = buildIdentity().email;
      const password = buildPassword();
      await renderSignUp();
      await submitCredentials(email, password);
      const alerts = await screen.findAllByRole('alert');
      expect(alerts).toHaveLength(1);
      for (const message of messages) expect(within(alerts[0]).getByText(message)).toBeTruthy();
      expectAlertOmits(alerts[0], [email, password]);
      expect(screen.getByLabelText(PASSWORD_LABEL)).toBeTruthy();
      expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
      expect(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON })).toBeEnabled();
      expect(readSignedInUser()).toBe('guest');
      expect(mockNavigations).toEqual([]);
    },
  );

  it('ties the breached alert to the password field by aria-describedby', async () => {
    installRoutedFetch({ [SIGNUPS_ROUTE]: errorReply(400, 'AUTH_PASSWORD_BREACHED') });
    await renderSignUp();
    await submitCredentials(buildIdentity().email, buildPassword());
    const alert = await screen.findByRole('alert');
    expect(readDescribedByIds(screen.getByLabelText(PASSWORD_LABEL))).toContain(readAlertId(alert));
  });

  it('sends one request when "Create account" is pressed again while the first is in flight', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: held });
    await renderSignUp();
    await submitCredentials(buildIdentity().email, buildPassword());
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON }));
    await fireEvent(screen.getByLabelText(PASSWORD_LABEL), 'submitEditing');
    expect(requests.filter((request) => request.path === 'auth/signups')).toHaveLength(1);
    await act(async () => held.release(codeSentReply()));
    await screen.findByLabelText(CODE_LABEL);
    expect(requests.filter((request) => request.path === 'auth/signups')).toHaveLength(1);
  });
});

describe('sign-up route, code step', () => {
  it('posts the email, the code, and the same password to POST auth/signups/verify', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const { requests } = installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: verifiedReply(identity, true),
    });
    await renderSignUp();
    await reachCodeStep(identity.email, password);
    await submitCode(identity.code);
    await waitFor(() => expect(requests.filter((request) => request.path === 'auth/signups/verify')).toHaveLength(1));
    const [verify] = requests.filter((request) => request.path === 'auth/signups/verify');
    expect(verify.method).toBe('POST');
    expect(verify.body).toMatchObject({ code: identity.code, email: identity.email, password });
  });

  it('sends the device IANA time zone with the verify request, as code sign-in does', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: verifiedReply(identity, true),
    });
    const restoreTimeZone = pinDeviceTimeZone('Pacific/Chatham');
    try {
      await renderSignUp();
      await reachCodeStep(identity.email, buildPassword());
      await submitCode(identity.code);
      await waitFor(() => expect(requests.filter((request) => request.path === 'auth/signups/verify')).toHaveLength(1));
    } finally {
      restoreTimeZone();
    }
    const [verify] = requests.filter((request) => request.path === 'auth/signups/verify');
    expect(verify.body).toMatchObject({ timezone: 'Pacific/Chatham' });
  });

  it('signs in on isPasswordApplied true, keeping the session value in the secure store, and goes home', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, true) });
    await renderSignUp();
    await reachCodeStep(identity.email, buildPassword());
    await submitCode(identity.code);
    await waitFor(() => expect(readSignedInUser()).toBe(identity.userId));
    expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(identity.sessionValue);
    await waitFor(() => expect(mockNavigations).toHaveLength(1));
    expect(toHref(mockNavigations[0])).toBe('/');
    expect(screen.queryByText(ALREADY_HAD_ACCOUNT)).toBeNull();
  });

  it('goes to a safe returnTo after isPasswordApplied true', async () => {
    const identity = buildIdentity();
    mockParams.current = { returnTo: '/python?paywall=medium' };
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, true) });
    await renderSignUp();
    await reachCodeStep(identity.email, buildPassword());
    await submitCode(identity.code);
    await waitFor(() => expect(mockNavigations).toHaveLength(1));
    expect(toHref(mockNavigations[0])).toBe('/python?paywall=medium');
  });

  it.each(['//evil.example/python', 'https://evil.example', 'javascript:alert(1)'])(
    'ignores the unsafe returnTo %p and goes home',
    async (returnTo) => {
      const identity = buildIdentity();
      mockParams.current = { returnTo };
      installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, true) });
      await renderSignUp();
      await reachCodeStep(identity.email, buildPassword());
      await submitCode(identity.code);
      await waitFor(() => expect(mockNavigations).toHaveLength(1));
      expect(toHref(mockNavigations[0])).toBe('/');
    },
  );

  it('signs in on isPasswordApplied false and says the password was not changed, staying to show it', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, false) });
    await renderSignUp();
    await reachCodeStep(identity.email, buildPassword());
    await submitCode(identity.code);
    expect(await screen.findByText(ALREADY_HAD_ACCOUNT)).toBeTruthy();
    expect(readSignedInUser()).toBe(identity.userId);
    expect(secureStore.mockValues.get(SESSION_TOKEN_KEY)).toBe(identity.sessionValue);
    expect(mockNavigations).toEqual([]);
    expect(listLevelOneHeadings()).toHaveLength(1);
  });

  it.each([
    ['400 AUTH_INVALID_CODE', errorReply(400, 'AUTH_INVALID_CODE'), INVALID_CODE_MESSAGE],
    ['429 RATE_LIMIT_EXCEEDED', errorReply(429, 'RATE_LIMIT_EXCEEDED'), RATE_LIMITED_MESSAGE],
  ])('announces %s on the code step, stays signed out, and keeps the code step', async (_label, reply, message) => {
    const identity = buildIdentity();
    const password = buildPassword();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: reply });
    await renderSignUp();
    await reachCodeStep(identity.email, password);
    await submitCode(identity.code);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(message)).toBeTruthy();
    expectAlertOmits(alert, [identity.email, password, identity.code]);
    expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
    expect(readSignedInUser()).toBe('guest');
    expect(secureStore.mockValues.has(SESSION_TOKEN_KEY)).toBe(false);
    expect(mockNavigations).toEqual([]);
  });

  it('sends the same password again with a second code after a bad code', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const { requests } = installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: [errorReply(400, 'AUTH_INVALID_CODE'), verifiedReply(identity, true)],
    });
    await renderSignUp();
    await reachCodeStep(identity.email, password);
    await submitCode(identity.code);
    await screen.findByRole('alert');
    await submitCode(identity.code);
    await waitFor(() => expect(readSignedInUser()).toBe(identity.userId));
    const verifies = requests.filter((request) => request.path === 'auth/signups/verify');
    expect(verifies).toHaveLength(2);
    for (const verify of verifies) expect(verify.body).toMatchObject({ email: identity.email, password });
  });

  describe('resend', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('posts auth/signups again with the same email and password after the cooldown, and restarts it', async () => {
      const email = buildIdentity().email;
      const password = buildPassword();
      const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
      await renderSignUp();
      await reachCodeStep(email, password);
      const resendButton = () => screen.getByRole('button', { name: new RegExp(RESEND_BUTTON) });
      expect(resendButton()).toBeDisabled();

      await advanceSeconds(RESEND_COOLDOWN_SECONDS);
      expect(resendButton()).toBeEnabled();
      await fireEvent.press(resendButton());
      await waitFor(() => expect(requests.filter((request) => request.path === 'auth/signups')).toHaveLength(2));

      const posted = requests.filter((request) => request.path === 'auth/signups');
      expect(posted[1].body).toEqual({ email, password });
      expect(resendButton()).toBeDisabled();
      expect(screen.getByText(new RegExp(`\\b${RESEND_COOLDOWN_SECONDS} seconds\\b`))).toBeTruthy();
      expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
    });
  });
});

describe('the password stays in memory and reaches only the sign-up requests (B-90)', () => {
  function serialiseCalls(mock: jest.Mock): string {
    return JSON.stringify(mock.mock.calls);
  }

  it('reaches no AsyncStorage, SecureStore, logWarning, analytics, purchaser, or console call across a refusal, a retry, a bad code, a success, and an unmount', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const consoleCapture = captureConsole();
    const storageSpies = [
      jest.spyOn(AsyncStorage, 'setItem'),
      jest.spyOn(AsyncStorage, 'multiSet'),
      jest.spyOn(AsyncStorage, 'mergeItem'),
      jest.spyOn(AsyncStorage, 'multiMerge'),
    ];
    try {
      const { requests } = installRoutedFetch({
        [SIGNUPS_ROUTE]: [errorReply(503, 'SERVER_EMAIL_UNAVAILABLE'), codeSentReply()],
        [VERIFY_ROUTE]: [errorReply(400, 'AUTH_INVALID_CODE'), verifiedReply(identity, true)],
      });
      const rendered = await renderSignUp();

      // A refused first step, then the same password accepted.
      await submitCredentials(identity.email, password);
      await screen.findByRole('alert');
      await fireEvent.press(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON }));
      await screen.findByLabelText(CODE_LABEL);

      // A bad code, then the right one.
      await submitCode(identity.code);
      await screen.findByRole('alert');
      await submitCode(identity.code);
      await waitFor(() => expect(readSignedInUser()).toBe(identity.userId));
      await waitFor(() => expect(mockNavigations).toHaveLength(1));

      await rendered.unmount();
      await act(async () => undefined);

      // Control: the password did travel, in the sign-up request bodies and nowhere else.
      const signUpRequests = requests.filter((request) => request.path.startsWith('auth/signups'));
      expect(signUpRequests).toHaveLength(4);
      for (const request of signUpRequests) expect(request.body).toMatchObject({ password });
      const otherRequests = requests.filter((request) => !request.path.startsWith('auth/signups'));
      expect(JSON.stringify(otherRequests)).not.toContain(password);

      for (const spy of storageSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
      expect((await readAllStoredValues()).join('\n')).not.toContain(password);
      expect(serialiseCalls(secureStore.setItemAsync)).not.toContain(password);
      expect(secureStore.setItemAsync.mock.calls).toEqual([[SESSION_TOKEN_KEY, identity.sessionValue]]);
      expect(serialiseCalls(mockLogWarning)).not.toContain(password);
      expect(serialiseCalls(mockIdentifyAnalytics)).not.toContain(password);
      expect(serialiseCalls(mockResetAnalytics)).not.toContain(password);
      expect(serialiseCalls(mockTrackEvent)).not.toContain(password);
      expect(serialiseCalls(mockIdentifyPurchaser)).not.toContain(password);
      expect(serialiseCalls(mockResetPurchaser)).not.toContain(password);
      expect(consoleCapture.serialised()).not.toContain(password);
      expect(JSON.stringify(mockNavigations)).not.toContain(password);
    } finally {
      for (const spy of storageSpies) spy.mockRestore();
      consoleCapture.restore();
    }
  });

  it('clears the password when the route is left from the code step: a new visit starts on an empty password step', async () => {
    const password = buildPassword();
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    const first = await renderSignUp();
    await reachCodeStep(buildIdentity().email, password);
    await first.unmount();
    await act(async () => undefined);

    await renderSignUp();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe('');
    expect(requests.filter((request) => request.path.startsWith('auth/signups'))).toHaveLength(1);
    expect((await readAllStoredValues()).join('\n')).not.toContain(password);
  });

  it('shows no input holding the password once the account exists', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, false) });
    await renderSignUp();
    await reachCodeStep(identity.email, password);
    await submitCode(identity.code);
    await screen.findByText(ALREADY_HAD_ACCOUNT);
    const values = screen.container
      .queryAll((node) => typeof node.props?.value === 'string')
      .map((node) => node.props.value as string);
    expect(values).not.toContain(password);
    expect(screen.queryByText(new RegExp(escapeForRegExp(password)))).toBeNull();
  });
});

describe('links between sign-in and sign-up', () => {
  it('links from sign-up to /sign-in', async () => {
    installRoutedFetch({});
    await renderSignUp();
    await fireEvent.press(screen.getByRole('link', { name: SIGN_IN_LINK_NAME }));
    expect(mockNavigations).toHaveLength(1);
    expect(toHref(mockNavigations[0])).toBe('/sign-in');
  });

  it('keeps a safe returnTo on the link from sign-up to /sign-in', async () => {
    mockParams.current = { returnTo: '/python?paywall=medium' };
    installRoutedFetch({});
    await renderSignUp();
    await fireEvent.press(screen.getByRole('link', { name: SIGN_IN_LINK_NAME }));
    expect(mockNavigations).toHaveLength(1);
    expect(parseHref(mockNavigations[0])).toEqual({
      pathname: '/sign-in',
      params: { returnTo: '/python?paywall=medium' },
    });
  });

  it('forwards a safe returnTo from "Create an account" on sign-in to /sign-up', async () => {
    mockParams.current = { returnTo: '/python?paywall=medium' };
    installRoutedFetch({});
    await render(
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>,
    );
    await fireEvent.press(await screen.findByRole('link', { name: CREATE_ACCOUNT_LINK }));
    expect(mockNavigations).toHaveLength(1);
    expect(parseHref(mockNavigations[0])).toEqual({
      pathname: '/sign-up',
      params: { returnTo: '/python?paywall=medium' },
    });
  });

  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)'])(
    'drops the unsafe returnTo %p from "Create an account" on sign-in',
    async (returnTo) => {
      mockParams.current = { returnTo };
      installRoutedFetch({});
      await render(
        <AuthProvider>
          <SignInScreen />
        </AuthProvider>,
      );
      await fireEvent.press(await screen.findByRole('link', { name: CREATE_ACCOUNT_LINK }));
      expect(mockNavigations).toHaveLength(1);
      expect(parseHref(mockNavigations[0])).toEqual({ pathname: '/sign-up', params: {} });
    },
  );

  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)'])(
    'drops the unsafe returnTo %p from the link on sign-up to /sign-in',
    async (returnTo) => {
      mockParams.current = { returnTo };
      installRoutedFetch({});
      await renderSignUp();
      await fireEvent.press(screen.getByRole('link', { name: SIGN_IN_LINK_NAME }));
      expect(mockNavigations).toHaveLength(1);
      expect(parseHref(mockNavigations[0])).toEqual({ pathname: '/sign-in', params: {} });
    },
  );
});
