// Leaving the sign-up route clears the in-memory password (PR 107 review).
// In a stack, pressing "Sign in" pushes /sign-in and the sign-up screen stays
// mounted underneath, blurred. When the user comes back to it, the password
// field is empty. Runs under expo-router's real router, so focus and blur are
// the router's own. Values are built at run time.
import { randomBytes } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { buildIdentity, installRoutedFetch } from '../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../state/AuthProvider';
import SignInScreen from '../sign-in';
import SignUpScreen from '../sign-up';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../clients/purchasesIdentity', () => ({
  identifyPurchaser: () => Promise.resolve(),
  resetPurchaser: () => Promise.resolve(),
}));

jest.mock('../../clients/analyticsClient', () => ({
  identifyAnalyticsUser: () => undefined,
  resetAnalyticsUser: () => undefined,
  trackEvent: () => undefined,
}));

const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const SIGN_IN_LINK_NAME = /sign in/i;

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function StackLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}

const routes = { _layout: StackLayout, 'sign-in': SignInScreen, 'sign-up': SignUpScreen };

beforeEach(() => AsyncStorage.clear());

describe('leaving the sign-up route', () => {
  it('clears the typed password when "Sign in" is pressed: back on sign-up, the password field is empty', async () => {
    installRoutedFetch({});
    const password = buildPassword();
    const pending = renderRouter(routes, { initialUrl: '/sign-up' });
    await pending;
    await fireEvent.changeText(await screen.findByLabelText(EMAIL_LABEL), buildIdentity().email);
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe(password);

    await fireEvent.press(screen.getByRole('link', { name: SIGN_IN_LINK_NAME }));
    await waitFor(() => expect(pending.getPathname()).toBe('/sign-in'));

    await act(async () => {
      router.back();
    });
    await waitFor(() => expect(pending.getPathname()).toBe('/sign-up'));
    const passwordFields = screen.getAllByLabelText(PASSWORD_LABEL, { includeHiddenElements: true });
    for (const field of passwordFields) expect(field.props.value).not.toBe(password);
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe('');
  });
});
