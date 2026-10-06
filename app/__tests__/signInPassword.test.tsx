// The sign-in route with a password (Task 7.7; B-86, B-89, B-90): the first
// step is email, password, and "Sign in"; a success navigates to returnTo; each
// failure reason has its own message in the alert region, which never echoes
// the email or the password; "Use a code instead" and "Forgot password?" open
// the existing code steps with the typed email kept and no password field;
// "Forgot password?" ends in Settings with the password form; "Create an
// account" opens /sign-up. Every value is built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import SignInScreen from '../sign-in';

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const router = {
    back: () => undefined,
    navigate: (...args: unknown[]) => mockPush(...args),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => mockParams.current,
    useLocalSearchParams: () => mockParams.current,
    useRouter: () => router,
  };
});

type AuthResult =
  | { isOk: true }
  | {
      isOk: false;
      reason: 'busy' | 'invalid-code' | 'invalid-credentials' | 'invalid-email' | 'rate-limited' | 'unavailable';
    };

const mockCredentialSignIn = jest.fn<Promise<AuthResult>, [string, string]>();
const mockRequestCode = jest.fn<Promise<AuthResult>, [string]>();
const mockVerifyCode = jest.fn<Promise<AuthResult>, [string, string]>();
jest.mock('../../state/AuthProvider', () => ({
  useAuth: () => ({
    completeGuestClaim: () => undefined,
    guestClaimUserId: null,
    isHydrated: true,
    isSignedIn: false,
    requestCode: (email: string) => mockRequestCode(email),
    signInWithPassword: (...args: [string, string]) => mockCredentialSignIn(...args),
    signOut: () => Promise.resolve(),
    user: null,
    verifyCode: (email: string, code: string) => mockVerifyCode(email, code),
  }),
  useSignedInUserId: () => null,
}));

const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const CODE_LABEL = 'Sign-in code';
const SIGN_IN = 'Sign in';
const USE_CODE = 'Use a code instead';
const FORGOT = 'Forgot password?';
const CREATE_ACCOUNT = 'Create an account';
const SEND_BUTTON = 'Send code';
const VERIFY_BUTTON = 'Verify code';
const INVALID_CREDENTIALS_MESSAGE = 'That email and password do not match. Try again, or use a code instead.';
const RATE_LIMITED_MESSAGE = 'Too many attempts. Wait a few minutes, then try again.';
const BUSY_MESSAGE = 'Sign-in is busy. Try again, or use a code instead.';
const UNAVAILABLE_MESSAGE = 'Sign-in is unavailable right now. Try again later.';
const SETTINGS_PASSWORD_FORM = '/settings?form=password';

function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function buildCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listLevelOneHeadings(): string[] {
  return screen
    .getAllByRole('heading')
    .filter((heading) => heading.props['aria-level'] === 1 || heading.props.accessibilityLevel === 1)
    .map((heading) => String(heading.props.children));
}

function expectAlertOmits(alert: ReturnType<typeof screen.getByRole>, values: string[]): void {
  for (const value of values) {
    expect(within(alert).queryByText(new RegExp(escapeForRegExp(value)))).toBeNull();
  }
}

function toHref(href: unknown): string {
  if (typeof href === 'string') return href;
  const { params = {}, pathname } = href as { params?: Record<string, string>; pathname: string };
  const query = new URLSearchParams(params).toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}

async function typeCredentials(email: string, typedPassword: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), typedPassword);
}

async function signInWith(email: string, typedPassword: string): Promise<void> {
  await typeCredentials(email, typedPassword);
  await fireEvent.press(screen.getByRole('button', { name: SIGN_IN }));
}

beforeEach(() => {
  mockParams.current = {};
});

describe('sign-in route, password step', () => {
  it('opens on one h1 "Sign in" with an email field, a hidden current-password field, and the sign-in controls', async () => {
    await render(<SignInScreen />);
    expect(listLevelOneHeadings()).toEqual(['Sign in']);
    expect(screen.getByLabelText(EMAIL_LABEL)).toBeTruthy();
    const passwordInput = screen.getByLabelText(PASSWORD_LABEL);
    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoComplete).toBe('current-password');
    expect(passwordInput.props.textContentType).toBe('password');
    expect(screen.getByRole('button', { name: SIGN_IN })).toBeTruthy();
    expect(screen.getByRole('button', { name: USE_CODE })).toBeTruthy();
    expect(screen.getByRole('button', { name: FORGOT })).toBeTruthy();
    expect(screen.getByRole('link', { name: CREATE_ACCOUNT })).toBeTruthy();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.queryByRole('button', { name: SEND_BUTTON })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('signs in with the typed email and password and replaces the route with home', async () => {
    const email = buildEmail();
    const password = buildPassword();
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await signInWith(email, password);
    expect(mockCredentialSignIn).toHaveBeenCalledTimes(1);
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, password);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('signs in from the return key in the password field', async () => {
    const email = buildEmail();
    const password = buildPassword();
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await typeCredentials(email, password);
    await fireEvent(screen.getByLabelText(PASSWORD_LABEL), 'submitEditing');
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, password);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('signs in from the return key in the email field, sending one request with the typed email and password', async () => {
    const email = buildEmail();
    const password = buildPassword();
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await typeCredentials(email, password);
    await fireEvent(screen.getByLabelText(EMAIL_LABEL), 'submitEditing');
    expect(mockCredentialSignIn).toHaveBeenCalledTimes(1);
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, password);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('returns to the paid bank paywall in returnTo after a password sign-in', async () => {
    mockParams.current = { returnTo: '/python?paywall=medium' };
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await signInWith(buildEmail(), buildPassword());
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(toHref(mockReplace.mock.calls[0][0])).toBe('/python?paywall=medium');
  });

  it('ignores a returnTo naming another origin and goes home', async () => {
    mockParams.current = { returnTo: '//evil.example/python' };
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await signInWith(buildEmail(), buildPassword());
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('empties the password field after a successful sign-in', async () => {
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await signInWith(buildEmail(), buildPassword());
    expect(mockReplace).toHaveBeenCalled();
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe('');
  });

  it('sends a password shorter than 12 characters, since only the server judges a sign-in', async () => {
    const email = buildEmail();
    const shortPassword = randomBytes(3).toString('hex');
    mockCredentialSignIn.mockResolvedValue({ isOk: false, reason: 'invalid-credentials' });
    await render(<SignInScreen />);
    await signInWith(email, shortPassword);
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, shortPassword);
  });

  it.each([
    ['invalid-credentials', INVALID_CREDENTIALS_MESSAGE],
    ['rate-limited', RATE_LIMITED_MESSAGE],
    ['busy', BUSY_MESSAGE],
    ['unavailable', UNAVAILABLE_MESSAGE],
  ] as const)(
    'announces %s in the alert region without echoing the email or the password, and stays on the password step',
    async (reason, message) => {
      const email = buildEmail();
      const password = buildPassword();
      mockCredentialSignIn.mockResolvedValue({ isOk: false, reason });
      await render(<SignInScreen />);
      await signInWith(email, password);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(within(alerts[0]).getByText(message)).toBeTruthy();
      expectAlertOmits(alerts[0], [email, password]);
      expect(screen.getByLabelText(PASSWORD_LABEL)).toBeTruthy();
      expect(screen.getByRole('button', { name: SIGN_IN })).toBeEnabled();
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  it('shows only the fixed message for an oversized password the server rejects, never the value', async () => {
    const email = buildEmail();
    const oversized = randomBytes(400).toString('hex');
    mockCredentialSignIn.mockResolvedValue({ isOk: false, reason: 'invalid-credentials' });
    await render(<SignInScreen />);
    await signInWith(email, oversized);
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, oversized);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(INVALID_CREDENTIALS_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [oversized.slice(0, 40)]);
  });

  it('sends one request when "Sign in" is pressed again while the first is in flight', async () => {
    let settle: (result: AuthResult) => void = () => undefined;
    mockCredentialSignIn.mockReturnValue(
      new Promise<AuthResult>((resolve) => {
        settle = resolve;
      }),
    );
    await render(<SignInScreen />);
    await signInWith(buildEmail(), buildPassword());
    expect(screen.getByRole('button', { name: SIGN_IN })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN }));
    await fireEvent(screen.getByLabelText(PASSWORD_LABEL), 'submitEditing');
    expect(mockCredentialSignIn).toHaveBeenCalledTimes(1);
    await act(async () => settle({ isOk: false, reason: 'invalid-credentials' }));
    expect(mockCredentialSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: SIGN_IN })).toBeEnabled();
  });
});

describe('sign-in route, "Use a code instead"', () => {
  it('shows the email step with the typed email kept and no password field, and keeps one h1', async () => {
    const email = buildEmail();
    await render(<SignInScreen />);
    await typeCredentials(email, buildPassword());
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE }));
    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe(email);
    expect(screen.queryByLabelText(PASSWORD_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: SEND_BUTTON })).toBeTruthy();
    expect(listLevelOneHeadings()).toEqual(['Sign in']);
    expect(mockCredentialSignIn).not.toHaveBeenCalled();
  });

  it('runs the code steps with the kept email and then returns to returnTo', async () => {
    const email = buildEmail();
    const code = buildCode();
    mockParams.current = { returnTo: '/python?paywall=medium' };
    mockRequestCode.mockResolvedValue({ isOk: true });
    mockVerifyCode.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE }));
    await fireEvent.press(screen.getByRole('button', { name: SEND_BUTTON }));
    expect(mockRequestCode).toHaveBeenCalledWith(email);
    await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
    await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
    expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
    expect(toHref(mockReplace.mock.calls[0][0])).toBe('/python?paywall=medium');
  });
});

describe('sign-in route, "Forgot password?"', () => {
  it('shows the email step with the typed email kept and no password field', async () => {
    const email = buildEmail();
    await render(<SignInScreen />);
    await typeCredentials(email, buildPassword());
    await fireEvent.press(screen.getByRole('button', { name: FORGOT }));
    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe(email);
    expect(screen.queryByLabelText(PASSWORD_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: SEND_BUTTON })).toBeTruthy();
    expect(mockCredentialSignIn).not.toHaveBeenCalled();
  });

  it('runs the code steps and then opens Settings with the password form, even with a returnTo', async () => {
    const email = buildEmail();
    const code = buildCode();
    mockParams.current = { returnTo: '/python?paywall=medium' };
    mockRequestCode.mockResolvedValue({ isOk: true });
    mockVerifyCode.mockResolvedValue({ isOk: true });
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
    await fireEvent.press(screen.getByRole('button', { name: FORGOT }));
    await fireEvent.press(screen.getByRole('button', { name: SEND_BUTTON }));
    expect(mockRequestCode).toHaveBeenCalledWith(email);
    await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
    await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
    expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(toHref(mockReplace.mock.calls[0][0])).toBe(SETTINGS_PASSWORD_FORM);
  });

  it('does not navigate when the code fails', async () => {
    mockRequestCode.mockResolvedValue({ isOk: true });
    mockVerifyCode.mockResolvedValue({ isOk: false, reason: 'invalid-code' });
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), buildEmail());
    await fireEvent.press(screen.getByRole('button', { name: FORGOT }));
    await fireEvent.press(screen.getByRole('button', { name: SEND_BUTTON }));
    await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), buildCode());
    await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('sign-in route, "Create an account"', () => {
  it('opens the sign-up route', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByRole('link', { name: CREATE_ACCOUNT }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(toHref(mockPush.mock.calls[0][0])).toBe('/sign-up');
  });
});
