// The sign-in route with a password on the web (Task 7.7; B-57, B-64, B-86,
// B-89): one h1, a labeled <input type="password" autocomplete=
// "current-password">, a failure tied to the password input through
// aria-describedby to the role="alert" region, Enter submitting from the
// password field, quiz key bindings inert while it has focus, and every
// control reachable by Tab (natively focusable, in order, no positive
// tabindex) and operable by Enter. Values are built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useKeyboardNav } from '../../state/useKeyboardNav';
import SignInScreen from '../sign-in';

const mockReplacedRoutes: unknown[] = [];
const mockPushedRoutes: unknown[] = [];
jest.mock('expo-router', () => {
  const router = {
    back: () => undefined,
    navigate: (route: unknown) => mockPushedRoutes.push(route),
    push: (route: unknown) => mockPushedRoutes.push(route),
    replace: (route: unknown) => mockReplacedRoutes.push(route),
  };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useLocalSearchParams: () => ({}),
    useRouter: () => router,
  };
});
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));

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
const SHOW = 'Show password';
const SIGN_IN = 'Sign in';
const USE_CODE = 'Use a code instead';
const FORGOT = 'Forgot password?';
const CREATE_ACCOUNT = 'Create an account';
const INVALID_CREDENTIALS_MESSAGE = 'That email and password do not match. Try again, or use a code instead.';
const BUSY_MESSAGE = 'Sign-in is busy. Try again, or use a code instead.';

function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function getEmailInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: EMAIL_LABEL }) as HTMLInputElement;
}

function getPasswordInput(): HTMLInputElement {
  return screen.getByLabelText(PASSWORD_LABEL, { selector: 'input' }) as HTMLInputElement;
}

function queryPasswordInput(): HTMLElement | null {
  return screen.queryByLabelText(PASSWORD_LABEL, { selector: 'input' });
}

function getCreateAccount(): HTMLElement {
  return screen.getByRole('link', { name: CREATE_ACCOUNT });
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function readDescription(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

// What a browser does for Enter on a focused control: keydown and keyup reach
// it, and on a native <button> or <a> the browser also dispatches a click
// (jsdom does not, so the click is sent here for those elements only).
async function pressEnterOn(element: HTMLElement): Promise<void> {
  act(() => element.focus());
  expect(document.activeElement).toBe(element);
  await act(async () => {
    fireEvent.keyDown(element, { key: 'Enter', code: 'Enter' });
    fireEvent.keyUp(element, { key: 'Enter', code: 'Enter' });
    if (element.tagName === 'BUTTON' || element.tagName === 'A') fireEvent.click(element);
  });
}

// Elements the browser puts in the Tab order, in document order.
function listTabbable(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>('input, button, a[href], select, textarea, [tabindex]');
  return Array.from(candidates).filter(
    (element) =>
      element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.closest('[aria-hidden="true"]') === null,
  );
}

function expectTabbable(container: HTMLElement, element: HTMLElement): void {
  expect(listTabbable(container)).toContain(element);
}

const keyHandlers = {
  onAdvance: jest.fn(),
  onEscape: jest.fn(),
  onSelectBool: jest.fn(),
  onSelectChoice: jest.fn(),
  onToggleQuery: jest.fn(),
};

function QuizKeysHarness() {
  useKeyboardNav(keyHandlers);
  return null;
}

function pressKeyOn(target: EventTarget, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

beforeEach(() => {
  mockReplacedRoutes.length = 0;
  mockPushedRoutes.length = 0;
});

describe('sign-in route with a password on the web', () => {
  it('renders one h1 "Sign in", a labeled email field, and a labeled password input of type password with autocomplete current-password', () => {
    render(<SignInScreen />);
    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Sign in');
    expect(getEmailInput().tagName).toBe('INPUT');
    const passwordInput = getPasswordInput();
    expect(passwordInput.getAttribute('type')).toBe('password');
    expect(passwordInput.getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByText(PASSWORD_LABEL)).toBeTruthy();
  });

  it('signs in when Enter is pressed in the password field', async () => {
    const email = buildEmail();
    const password = buildPassword();
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    render(<SignInScreen />);
    typeInto(getEmailInput(), email);
    typeInto(getPasswordInput(), password);
    await act(async () => {
      fireEvent.keyDown(getPasswordInput(), { key: 'Enter' });
    });
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, password);
    expect(mockReplacedRoutes).toEqual(['/']);
  });

  it('signs in when Enter is pressed in the email field, sending one request with the typed email and password', async () => {
    const email = buildEmail();
    const password = buildPassword();
    mockCredentialSignIn.mockResolvedValue({ isOk: true });
    render(<SignInScreen />);
    typeInto(getEmailInput(), email);
    typeInto(getPasswordInput(), password);
    await act(async () => {
      fireEvent.keyDown(getEmailInput(), { key: 'Enter' });
    });
    expect(mockCredentialSignIn).toHaveBeenCalledTimes(1);
    expect(mockCredentialSignIn).toHaveBeenCalledWith(email, password);
    expect(mockReplacedRoutes).toEqual(['/']);
  });

  it.each([
    ['invalid-credentials', INVALID_CREDENTIALS_MESSAGE],
    ['busy', BUSY_MESSAGE],
  ] as const)('ties the %s alert to the password input through aria-describedby', async (reason, message) => {
    mockCredentialSignIn.mockResolvedValue({ isOk: false, reason });
    render(<SignInScreen />);
    typeInto(getEmailInput(), buildEmail());
    typeInto(getPasswordInput(), buildPassword());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SIGN_IN }));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.id).not.toBe('');
    const passwordInput = getPasswordInput();
    expect((passwordInput.getAttribute('aria-describedby') ?? '').split(/\s+/)).toContain(alert.id);
    expect(readDescription(passwordInput)).toContain(message);
  });

  describe('quiz key bindings (B-57)', () => {
    it.each(['a', 't', 'f', 'q', '1', 'Escape', 'Enter'])(
      'pressing %p in the password field fires none',
      async (key) => {
        mockCredentialSignIn.mockResolvedValue({ isOk: false, reason: 'invalid-credentials' });
        render(
          <>
            <SignInScreen />
            <QuizKeysHarness />
          </>,
        );
        const passwordInput = getPasswordInput();
        act(() => passwordInput.focus());
        pressKeyOn(passwordInput, key);
        await act(async () => undefined);
        for (const handler of Object.values(keyHandlers)) expect(handler).not.toHaveBeenCalled();
      },
    );
  });

  describe('keyboard operation (B-64)', () => {
    it('puts every control in the Tab order, in reading order, with no positive tabindex', () => {
      const { container } = render(<SignInScreen />);
      const controls = [
        getEmailInput(),
        getPasswordInput(),
        screen.getByRole('button', { name: SHOW }),
        screen.getByRole('button', { name: SIGN_IN }),
      ];
      const tabbable = listTabbable(container);
      for (const control of controls) expect(tabbable).toContain(control);
      const positions = controls.map((control) => tabbable.indexOf(control));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      for (const control of [
        screen.getByRole('button', { name: USE_CODE }),
        screen.getByRole('button', { name: FORGOT }),
        getCreateAccount(),
      ]) {
        expectTabbable(container, control);
      }
      expect(
        Array.from(container.querySelectorAll('[tabindex]')).filter(
          (element) => Number(element.getAttribute('tabindex')) > 0,
        ),
      ).toEqual([]);
    });

    it('toggles the password with Enter on "Show password"', async () => {
      const password = buildPassword();
      render(<SignInScreen />);
      typeInto(getPasswordInput(), password);
      await pressEnterOn(screen.getByRole('button', { name: SHOW }));
      expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
      expect(getPasswordInput().value).toBe(password);
      expect(getPasswordInput().getAttribute('type')).not.toBe('password');
    });

    it('signs in with Enter on "Sign in"', async () => {
      const email = buildEmail();
      const password = buildPassword();
      mockCredentialSignIn.mockResolvedValue({ isOk: true });
      render(<SignInScreen />);
      typeInto(getEmailInput(), email);
      typeInto(getPasswordInput(), password);
      await pressEnterOn(screen.getByRole('button', { name: SIGN_IN }));
      expect(mockCredentialSignIn).toHaveBeenCalledTimes(1);
      expect(mockCredentialSignIn).toHaveBeenCalledWith(email, password);
    });

    it.each([USE_CODE, FORGOT])('opens the code steps with Enter on "%s", with the email kept', async (name) => {
      const email = buildEmail();
      render(<SignInScreen />);
      typeInto(getEmailInput(), email);
      await pressEnterOn(screen.getByRole('button', { name }));
      await waitFor(() => expect(queryPasswordInput()).toBeNull());
      expect(getEmailInput().value).toBe(email);
      expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy();
      expect(document.querySelectorAll('h1')).toHaveLength(1);
    });

    it('opens /sign-up with Enter on "Create an account"', async () => {
      render(<SignInScreen />);
      await pressEnterOn(getCreateAccount());
      expect(mockPushedRoutes).toHaveLength(1);
      expect(mockPushedRoutes[0]).toBe('/sign-up');
    });
  });
});
