// Task 3.18 RED (B-42): a guest who selected a paid bank arrives at sign-in
// with returnTo (the difficulty route with that bank's paywall param), and a
// successful sign-in goes back there, so the paywall opens for that bank.
// returnTo comes from the URL, so anything but an in-app path is ignored and
// sign-in goes home: another origin, a protocol-relative or backslash path, a
// script URL, a repeated param, or an oversized value.
import { randomInt } from 'node:crypto';

import { fireEvent, render, screen } from '@testing-library/react-native';

import SignInScreen from '../sign-in';

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockNavigations: unknown[] = [];

jest.mock('expo-router', () =>
  require('../../config/buildExpoRouterMock').buildExpoRouterMock({
    record: (href: unknown) => {
      mockNavigations.push(href);
    },
    readParams: () => mockParams.current,
  }),
);

jest.mock('../../state/AuthProvider', () => ({
  useAuth: () => ({
    completeGuestClaim: () => undefined,
    guestClaimUserId: null,
    isHydrated: true,
    isSignedIn: false,
    requestCode: () => Promise.resolve({ isOk: true }),
    signOut: () => Promise.resolve(),
    user: null,
    verifyCode: () => Promise.resolve({ isOk: true }),
  }),
  useSignedInUserId: () => null,
}));

// Built at run time: neither value is a literal in the source.
function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

function buildCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function toHref(href: unknown): string {
  if (typeof href === 'string') return href;
  const { params = {}, pathname } = href as { params?: Record<string, string>; pathname: string };
  const query = new URLSearchParams(params).toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}

async function signIn(): Promise<string> {
  await render(<SignInScreen />);
  // The screen opens on the password step (Task 7.7); the code steps are one press away.
  await fireEvent.press(screen.getByRole('button', { name: 'Use a code instead' }));
  await fireEvent.changeText(screen.getByLabelText('Email address'), buildEmail());
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  await fireEvent.changeText(screen.getByLabelText('Sign-in code'), buildCode());
  await fireEvent.press(screen.getByRole('button', { name: 'Verify code' }));
  expect(mockNavigations).toHaveLength(1);
  return toHref(mockNavigations[0]);
}

beforeEach(() => {
  mockNavigations.length = 0;
  mockParams.current = {};
});

describe('sign-in returnTo', () => {
  it('returns to the page the guest came from, with its query', async () => {
    mockParams.current = { returnTo: '/python/medium?count=20' };
    const href = await signIn();
    const url = new URL(href, 'https://app.test');
    expect(url.origin).toBe('https://app.test');
    expect(url.pathname).toBe('/python/medium');
    expect(url.searchParams.get('count')).toBe('20');
  });

  it('goes home when there is no returnTo', async () => {
    expect(await signIn()).toBe('/');
  });

  it.each([
    ['another origin', 'https://evil.example/python/medium?count=20'],
    ['a protocol-relative URL', '//evil.example/python'],
    ['a backslash path', '/\\evil.example/python'],
    ['a script URL', 'javascript:alert(1)'],
    ['a relative path with no leading slash', 'python/medium?count=20'],
    ['an oversized value', `/${'a'.repeat(10_000)}`],
    ['a repeated param', ['/python/medium?count=20', '//evil.example']],
  ])('ignores returnTo naming %s and goes home', async (_label, returnTo) => {
    mockParams.current = { returnTo };
    expect(await signIn()).toBe('/');
  });
});
