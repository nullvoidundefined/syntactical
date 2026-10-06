// The sign-up route on the web, PR 107 review findings. The real
// AuthProvider and apiFetch run against a routed fetch stand-in.
// - isPasswordApplied false: the notice sits in an element with
//   role="status", a "Continue" button navigates once to the safe returnTo or
//   "/", and the "Sign in" link is gone.
// - A 201 from auth/signups/verify that carries a token in its body writes
//   it to no storage: the web signs in by cookie only.
// - "/%2F%2Fevil.example" and "/%5Cevil.example" are accepted returnTo values
//   that only ever navigate in-app.
// Values are built at run time.
import { randomBytes } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  buildIdentity,
  installRoutedFetch,
  readAllStoredValues,
  type FakeReply,
  type SignInIdentity,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import SignUpScreen from '../sign-up';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

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
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));

const secureStore = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock };

const SIGNUPS_ROUTE = 'POST auth/signups';
const VERIFY_ROUTE = 'POST auth/signups/verify';
const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const CODE_LABEL = 'Sign-in code';
const CREATE_ACCOUNT_BUTTON = 'Create account';
const VERIFY_BUTTON = 'Verify code';
const CONTINUE_BUTTON = 'Continue';
const SIGN_IN_LINK_NAME = /sign in/i;
const ALREADY_HAD_ACCOUNT =
  'You already had an account, so we signed you in. Your password was not changed; you can set one in Settings.';
const ENCODED_SLASH_RETURN_TOS = ['/%2F%2Fevil.example', '/%5Cevil.example'];

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function codeSentReply(): FakeReply {
  return { status: 202, body: { data: { status: 'code-sent' } } };
}

function verifiedReplyWithToken(identity: SignInIdentity, isPasswordApplied: boolean): FakeReply {
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

function expectInAppTarget(target: string): void {
  expect(target.startsWith('/')).toBe(true);
  expect(target.startsWith('//')).toBe(false);
  expect(target.startsWith('/\\')).toBe(false);
  expect(target).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
  expect(new URL(target, 'https://app.test').origin).toBe('https://app.test');
}

function SignedInProbe() {
  const { user } = useAuth();
  return <output data-testid="signed-in-user">{user?.id ?? 'guest'}</output>;
}

async function renderSignUp() {
  const rendered = render(
    <AuthProvider>
      <SignUpScreen />
      <SignedInProbe />
    </AuthProvider>,
  );
  await screen.findByRole('textbox', { name: EMAIL_LABEL });
  return rendered;
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function signUpThroughCode(identity: SignInIdentity, password: string): Promise<void> {
  typeInto(screen.getByRole('textbox', { name: EMAIL_LABEL }), identity.email);
  typeInto(screen.getByLabelText(PASSWORD_LABEL, { selector: 'input' }), password);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: CREATE_ACCOUNT_BUTTON }));
  });
  const codeInput = await screen.findByLabelText(CODE_LABEL, { selector: 'input' });
  typeInto(codeInput, identity.code);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));
  });
}

function dumpWebStorage(storage: Storage): string {
  return Object.keys(storage)
    .map((key) => `${key}=${storage.getItem(key) ?? ''}`)
    .join('\n');
}

beforeEach(async () => {
  await AsyncStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockParams.current = {};
  mockNavigations.length = 0;
});

describe('sign-up on the web for an email that already had an account', () => {
  it('puts the notice in an element with role="status", shows "Continue", and hides the "Sign in" link', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReplyWithToken(identity, false) });
    await renderSignUp();
    await signUpThroughCode(identity, buildPassword());
    await screen.findByText(ALREADY_HAD_ACCOUNT);
    const regions = Array.from(document.querySelectorAll('[role="status"]'));
    expect(regions.some((region) => (region.textContent ?? '').includes(ALREADY_HAD_ACCOUNT))).toBe(true);
    expect(screen.getByRole('button', { name: CONTINUE_BUTTON })).toBeTruthy();
    expect(screen.queryByRole('link', { name: SIGN_IN_LINK_NAME })).toBeNull();
    expect(mockNavigations).toEqual([]);
  });

  it('keeps "Continue" outside the role="status" region, as a sibling of it, and moves focus to "Continue" or the notice', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReplyWithToken(identity, false) });
    await renderSignUp();
    await signUpThroughCode(identity, buildPassword());
    await screen.findByText(ALREADY_HAD_ACCOUNT);
    const region = Array.from(document.querySelectorAll('[role="status"]')).find((node) =>
      (node.textContent ?? '').includes(ALREADY_HAD_ACCOUNT),
    );
    expect(region).toBeDefined();
    const continueButton = screen.getByRole('button', { name: CONTINUE_BUTTON });
    expect(region?.contains(continueButton)).toBe(false);
    expect(continueButton.parentElement).toBe(region?.parentElement);
    await waitFor(() => {
      const focused = document.activeElement;
      expect(focused === continueButton || (focused !== null && region?.contains(focused) === true)).toBe(true);
    });
  });

  it('goes once to a safe returnTo when "Continue" is clicked', async () => {
    const identity = buildIdentity();
    mockParams.current = { returnTo: '/python?paywall=medium' };
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReplyWithToken(identity, false) });
    await renderSignUp();
    await signUpThroughCode(identity, buildPassword());
    await screen.findByText(ALREADY_HAD_ACCOUNT);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON }));
    });
    expect(mockNavigations).toHaveLength(1);
    expect(toHref(mockNavigations[0])).toBe('/python?paywall=medium');
  });
});

describe('sign-up on the web keeps a token in the verify body out of storage', () => {
  it('writes the token from a 201 body to no localStorage, sessionStorage, AsyncStorage, or SecureStore', async () => {
    const identity = buildIdentity();
    installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReplyWithToken(identity, true) });
    await renderSignUp();
    await signUpThroughCode(identity, buildPassword());
    await waitFor(() => expect(screen.getByTestId('signed-in-user').textContent).toBe(identity.userId));
    await waitFor(() => expect(mockNavigations).toHaveLength(1));
    expect(dumpWebStorage(window.localStorage)).not.toContain(identity.sessionValue);
    expect(dumpWebStorage(window.sessionStorage)).not.toContain(identity.sessionValue);
    expect((await readAllStoredValues()).join('\n')).not.toContain(identity.sessionValue);
    expect(JSON.stringify(secureStore.setItemAsync.mock.calls)).not.toContain(identity.sessionValue);
    expect(document.cookie).not.toContain(identity.sessionValue);
  });
});

describe('encoded-slash returnTo values on the web are accepted and stay in-app', () => {
  it.each(ENCODED_SLASH_RETURN_TOS)(
    'keeps the returnTo %p on the "Sign in" link, whose href and target stay in-app',
    async (returnTo) => {
      mockParams.current = { returnTo };
      installRoutedFetch({});
      await renderSignUp();
      const link = screen.getByRole('link', { name: SIGN_IN_LINK_NAME });
      const href = link.getAttribute('href') ?? '';
      expectInAppTarget(href);
      expect(new URL(href, 'https://app.test').searchParams.get('returnTo')).toBe(returnTo);
      await act(async () => {
        fireEvent.click(link, { button: 0 });
      });
      expect(mockNavigations).toHaveLength(1);
      expectInAppTarget(toHref(mockNavigations[0]));
    },
  );

  it.each(ENCODED_SLASH_RETURN_TOS)(
    'replaces to an in-app target for the returnTo %p after isPasswordApplied true',
    async (returnTo) => {
      const identity = buildIdentity();
      mockParams.current = { returnTo };
      installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply(), [VERIFY_ROUTE]: verifiedReplyWithToken(identity, true) });
      await renderSignUp();
      await signUpThroughCode(identity, buildPassword());
      await waitFor(() => expect(mockNavigations).toHaveLength(1));
      const target = toHref(mockNavigations[0]);
      expect(target).toBe(returnTo);
      expectInAppTarget(target);
    },
  );
});
