// The sign-up route on native, PR 107 review findings. The real AuthProvider
// and apiFetch run against a routed fetch stand-in.
// - A 503 SERVER_BUSY from either sign-up request says the server is busy and
//   to try again (not that sign-up is unavailable), and a retry with the same
//   code and password succeeds.
// - A 400 at verify that is not a password refusal never says the email is
//   wrong; INPUT_INVALID_BODY (a malformed code) gets the bad-code message.
// - isPasswordApplied false: the notice sits in a role="status" region, a
//   "Continue" button navigates once to the safe returnTo or "/", and the
//   "Sign in" link is gone.
// - A resend or a verify refused for the password returns to the password
//   step with the message, keeping the typed email and password.
// - "/%2F%2Fevil.example" and "/%5Cevil.example" are accepted returnTo values
//   that only ever navigate in-app.
// Every value is built at run time.
import { randomBytes } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  buildIdentity,
  installRoutedFetch,
  type FakeReply,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
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

jest.mock('../../clients/purchasesIdentity', () => ({
  identifyPurchaser: () => Promise.resolve(),
  resetPurchaser: () => Promise.resolve(),
}));

jest.mock('../../clients/analyticsClient', () => ({
  identifyAnalyticsUser: () => undefined,
  resetAnalyticsUser: () => undefined,
  trackEvent: () => undefined,
}));

// Every navigation (push, navigate, or replace) lands in one list.
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

const secureStore = jest.requireMock('expo-secure-store') as { mockValues: Map<string, string> };

const SIGNUPS_ROUTE = 'POST auth/signups';
const VERIFY_ROUTE = 'POST auth/signups/verify';
const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const CODE_LABEL = 'Sign-in code';
const CREATE_ACCOUNT_BUTTON = 'Create account';
const VERIFY_BUTTON = 'Verify code';
const RESEND_BUTTON = 'Resend code';
const CONTINUE_BUTTON = 'Continue';
const SIGN_IN_LINK_NAME = /sign in/i;
const ALREADY_HAD_ACCOUNT =
  'You already had an account, so we signed you in. Your password was not changed; you can set one in Settings.';
const RESEND_COOLDOWN_SECONDS = 60;

const BUSY_MESSAGE = /busy/i;
const TRY_AGAIN_MESSAGE = /try again/i;
const UNAVAILABLE_MESSAGE = /unavailable/i;
const INVALID_EMAIL_MESSAGE = /email address does not look right/i;
const CODE_MESSAGE = /code/i;
const BREACHED_MESSAGE = /data breach/i;
const TOO_SHORT_MESSAGE = /at least 12 characters/i;
const TOO_LONG_MESSAGE = /128 characters/i;

// Accepted returnTo values that look like an escape but stay in-app (PR 107 review).
const ENCODED_SLASH_RETURN_TOS = ['/%2F%2Fevil.example', '/%5Cevil.example'];

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

// A code the server refuses as malformed: five digits, not six.
function buildFiveDigitCode(): string {
  return String(10000 + (randomBytes(2).readUInt16BE(0) % 90000));
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

function toHref(href: unknown): string {
  if (typeof href === 'string') return href;
  const { params = {}, pathname } = href as { params?: Record<string, string>; pathname: string };
  const query = new URLSearchParams(params).toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}

// An in-app target: one leading slash, never a protocol-relative or absolute URL.
function expectInAppTarget(target: string): void {
  expect(target.startsWith('/')).toBe(true);
  expect(target.startsWith('//')).toBe(false);
  expect(target.startsWith('/\\')).toBe(false);
  expect(target).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
  expect(new URL(target, 'https://app.test').origin).toBe('https://app.test');
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

async function submitCredentials(email: string, password: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
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

async function advanceSeconds(seconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

// Every node whose role (web-style or native) is "status".
function listStatusRegions() {
  return screen.container.queryAll(
    (node) => node.props?.role === 'status' || node.props?.accessibilityRole === 'status',
  );
}

async function reachExistingAccountNotice(identity: SignInIdentity): Promise<void> {
  installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, false) });
  await renderSignUp();
  await reachCodeStep(identity.email, buildPassword());
  await submitCode(identity.code);
  await screen.findByText(ALREADY_HAD_ACCOUNT);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
  mockParams.current = {};
  mockNavigations.length = 0;
});

describe('sign-up when the server is busy (503 SERVER_BUSY)', () => {
  it('says the server is busy at verify, not that sign-up is unavailable, and a retry with the same code and password signs in', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    const { requests } = installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: [errorReply(503, 'SERVER_BUSY'), verifiedReply(identity, true)],
    });
    await renderSignUp();
    await reachCodeStep(identity.email, password);
    await submitCode(identity.code);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(BUSY_MESSAGE)).toBeTruthy();
    expect(within(alert).getByText(TRY_AGAIN_MESSAGE)).toBeTruthy();
    expect(within(alert).queryByText(UNAVAILABLE_MESSAGE)).toBeNull();
    expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
    expect(readSignedInUser()).toBe('guest');

    await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
    await waitFor(() => expect(readSignedInUser()).toBe(identity.userId));
    const verifies = requests.filter((request) => request.path === 'auth/signups/verify');
    expect(verifies).toHaveLength(2);
    for (const verify of verifies) {
      expect(verify.body).toMatchObject({ code: identity.code, email: identity.email, password });
    }
  });

  it('says the server is busy at the first step, keeps the password step, and a retry reaches the code step', async () => {
    const email = buildIdentity().email;
    const password = buildPassword();
    const { requests } = installRoutedFetch({
      [SIGNUPS_ROUTE]: [errorReply(503, 'SERVER_BUSY'), codeSentReply()],
    });
    await renderSignUp();
    await submitCredentials(email, password);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(BUSY_MESSAGE)).toBeTruthy();
    expect(within(alert).getByText(TRY_AGAIN_MESSAGE)).toBeTruthy();
    expect(within(alert).queryByText(UNAVAILABLE_MESSAGE)).toBeNull();
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe(password);

    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON }));
    await screen.findByLabelText(CODE_LABEL);
    const posted = requests.filter((request) => request.path === 'auth/signups');
    expect(posted).toHaveLength(2);
    for (const request of posted) expect(request.body).toEqual({ email, password });
  });
});

describe('sign-up verify refusals that are not about the email', () => {
  it('gives a malformed (five-digit) code refused with 400 INPUT_INVALID_BODY the bad-code message, never the bad-email one', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: errorReply(400, 'INPUT_INVALID_BODY'),
    });
    await renderSignUp();
    await reachCodeStep(identity.email, buildPassword());
    await submitCode(buildFiveDigitCode());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(CODE_MESSAGE)).toBeTruthy();
    expect(within(alert).queryByText(INVALID_EMAIL_MESSAGE)).toBeNull();
    expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
    expect(readSignedInUser()).toBe('guest');
  });

  it('does not say the email is wrong for an unrecognised 400 code at verify', async () => {
    const identity = buildIdentity();
    const unknownCode = `UNRECOGNISED_${randomBytes(3).toString('hex').toUpperCase()}`;
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: errorReply(400, unknownCode) });
    await renderSignUp();
    await reachCodeStep(identity.email, buildPassword());
    await submitCode(identity.code);
    const alert = await screen.findByRole('alert');
    expect(within(alert).queryByText(INVALID_EMAIL_MESSAGE)).toBeNull();
    expect(readSignedInUser()).toBe('guest');
  });
});

describe('sign-up for an email that already had an account (isPasswordApplied false)', () => {
  it('puts the notice in a role="status" region so it is announced', async () => {
    await reachExistingAccountNotice(buildIdentity());
    const regions = listStatusRegions();
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.some((region) => within(region).queryByText(ALREADY_HAD_ACCOUNT) !== null)).toBe(true);
  });

  it('does not navigate on its own, shows "Continue", and hides the "Sign in" link', async () => {
    await reachExistingAccountNotice(buildIdentity());
    expect(mockNavigations).toEqual([]);
    expect(screen.getByRole('button', { name: CONTINUE_BUTTON })).toBeTruthy();
    expect(screen.queryByRole('link', { name: SIGN_IN_LINK_NAME })).toBeNull();
  });

  it('goes home once when "Continue" is pressed', async () => {
    await reachExistingAccountNotice(buildIdentity());
    await fireEvent.press(screen.getByRole('button', { name: CONTINUE_BUTTON }));
    expect(mockNavigations).toHaveLength(1);
    expect(toHref(mockNavigations[0])).toBe('/');
  });

  it('goes to a safe returnTo once when "Continue" is pressed', async () => {
    mockParams.current = { returnTo: '/python?paywall=medium' };
    await reachExistingAccountNotice(buildIdentity());
    await fireEvent.press(screen.getByRole('button', { name: CONTINUE_BUTTON }));
    expect(mockNavigations).toHaveLength(1);
    expect(toHref(mockNavigations[0])).toBe('/python?paywall=medium');
  });

  it.each(['//evil.example/python', 'https://evil.example', 'javascript:alert(1)'])(
    'ignores the unsafe returnTo %p and goes home on "Continue"',
    async (returnTo) => {
      mockParams.current = { returnTo };
      await reachExistingAccountNotice(buildIdentity());
      await fireEvent.press(screen.getByRole('button', { name: CONTINUE_BUTTON }));
      expect(mockNavigations).toHaveLength(1);
      expect(toHref(mockNavigations[0])).toBe('/');
    },
  );
});

describe('password refusals after the first step return to the password step', () => {
  it('returns to the password step with the breached message for a 400 AUTH_PASSWORD_BREACHED at verify, keeping the email and password', async () => {
    const identity = buildIdentity();
    const password = buildPassword();
    installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: errorReply(400, 'AUTH_PASSWORD_BREACHED'),
    });
    await renderSignUp();
    await reachCodeStep(identity.email, password);
    await submitCode(identity.code);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(BREACHED_MESSAGE)).toBeTruthy();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe(identity.email);
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe(password);
    expect(readSignedInUser()).toBe('guest');
  });

  describe('on resend', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it.each([
      ['400 AUTH_PASSWORD_BREACHED', 'AUTH_PASSWORD_BREACHED', BREACHED_MESSAGE],
      ['400 AUTH_PASSWORD_TOO_SHORT', 'AUTH_PASSWORD_TOO_SHORT', TOO_SHORT_MESSAGE],
      ['400 AUTH_PASSWORD_TOO_LONG', 'AUTH_PASSWORD_TOO_LONG', TOO_LONG_MESSAGE],
    ])(
      'returns to the password step with the message for %s, keeping the typed email and password',
      async (_label, code, message) => {
        const email = buildIdentity().email;
        const password = buildPassword();
        installRoutedFetch({ [SIGNUPS_ROUTE]: [codeSentReply(), errorReply(400, code)] });
        await renderSignUp();
        await reachCodeStep(email, password);
        await advanceSeconds(RESEND_COOLDOWN_SECONDS);
        await fireEvent.press(screen.getByRole('button', { name: new RegExp(RESEND_BUTTON) }));
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText(message)).toBeTruthy();
        expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
        expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe(email);
        expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe(password);
      },
    );
  });
});

describe('encoded-slash returnTo values are accepted and stay in-app', () => {
  it.each(ENCODED_SLASH_RETURN_TOS)(
    'replaces to an in-app target for the returnTo %p after isPasswordApplied true',
    async (returnTo) => {
      const identity = buildIdentity();
      mockParams.current = { returnTo };
      installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReply(identity, true) });
      await renderSignUp();
      await reachCodeStep(identity.email, buildPassword());
      await submitCode(identity.code);
      await waitFor(() => expect(mockNavigations).toHaveLength(1));
      const target = toHref(mockNavigations[0]);
      expect(target).toBe(returnTo);
      expectInAppTarget(target);
    },
  );

  it.each(ENCODED_SLASH_RETURN_TOS)(
    'keeps the returnTo %p on the "Sign in" link, whose target stays in-app',
    async (returnTo) => {
      mockParams.current = { returnTo };
      installRoutedFetch({});
      await renderSignUp();
      await fireEvent.press(screen.getByRole('link', { name: SIGN_IN_LINK_NAME }));
      expect(mockNavigations).toHaveLength(1);
      const target = toHref(mockNavigations[0]);
      expectInAppTarget(target);
      const url = new URL(target, 'https://app.test');
      expect(url.pathname).toBe('/sign-in');
      expect(url.searchParams.get('returnTo')).toBe(returnTo);
    },
  );
});
