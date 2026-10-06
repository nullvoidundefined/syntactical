import { randomInt } from 'node:crypto';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { useKeyboardNav } from '../../state/useKeyboardNav';
import SignInScreen from '../sign-in';

// The sign-in route on the web (B-64, Task 3.10): one h1 element, labeled
// text inputs, Enter submits each step, keys typed into either field never
// reach the quiz key bindings, and no CSS animation runs under reduced motion.

// Every route the screen replaces to, in order.
const mockReplacedRoutes: unknown[] = [];
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { replace: (route: unknown) => mockReplacedRoutes.push(route) },
  useRouter: () => ({ replace: (route: unknown) => mockReplacedRoutes.push(route) }),
}));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));

type AuthResult = { isOk: true } | { isOk: false; reason: 'invalid-code' | 'invalid-email' | 'rate-limited' | 'unavailable' };

const mockRequestCode = jest.fn<Promise<AuthResult>, [string]>();
const mockVerifyCode = jest.fn<Promise<AuthResult>, [string, string]>();
jest.mock('../../state/AuthProvider', () => ({
  useAuth: () => ({
    completeGuestClaim: () => undefined,
    guestClaimUserId: null,
    isHydrated: true,
    isSignedIn: false,
    requestCode: (email: string) => mockRequestCode(email),
    signOut: () => Promise.resolve(),
    user: null,
    verifyCode: (email: string, code: string) => mockVerifyCode(email, code),
  }),
}));

const EMAIL_LABEL = 'Email address';
const CODE_LABEL = 'Sign-in code';

function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

function buildCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const keyHandlers = {
  onAdvance: jest.fn(),
  onEscape: jest.fn(),
  onSelectBool: jest.fn(),
  onSelectChoice: jest.fn(),
  onToggleQuery: jest.fn(),
};

// A quiz key binding mounted beside the sign-in screen, as the app shell
// can keep one alive while the route is open.
function QuizKeysHarness() {
  useKeyboardNav(keyHandlers);
  return null;
}

function renderWithQuizKeys() {
  return render(
    <>
      <SignInScreen />
      <QuizKeysHarness />
    </>,
  );
}

function pressKeyOn(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

function expectNoQuizBindingFired() {
  for (const handler of Object.values(keyHandlers)) {
    expect(handler).not.toHaveBeenCalled();
  }
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function reachCodeStep(email: string): Promise<HTMLElement> {
  mockRequestCode.mockResolvedValue({ isOk: true });
  // The screen opens on the password step (Task 7.7); "Use a code instead" opens the code steps.
  fireEvent.click(screen.getByRole('button', { name: 'Use a code instead' }));
  const emailInput = screen.getByRole('textbox', { name: EMAIL_LABEL });
  typeInto(emailInput, email);
  fireEvent.keyDown(emailInput, { key: 'Enter' });
  return screen.findByLabelText(CODE_LABEL);
}

describe('sign-in route on the web', () => {
  beforeEach(() => {
    mockReplacedRoutes.length = 0;
  });

  it('renders exactly one h1 element reading "Sign in" and a labeled email text field', () => {
    render(<SignInScreen />);
    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Sign in');
    expect(screen.getByRole('textbox', { name: EMAIL_LABEL }).tagName).toBe('INPUT');
  });

  it('submits the email when Enter is pressed in the email field', async () => {
    render(<SignInScreen />);
    const email = buildEmail();
    const codeInput = await reachCodeStep(email);
    expect(mockRequestCode).toHaveBeenCalledWith(email);
    expect(codeInput.tagName).toBe('INPUT');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('verifies the code when Enter is pressed in the code field', async () => {
    const email = buildEmail();
    const code = buildCode();
    // Only the typed pair verifies; any other pair renders the invalid-code alert.
    mockVerifyCode.mockImplementation(async (sentEmail, sentCode) =>
      sentEmail === email && sentCode === code ? { isOk: true } : { isOk: false, reason: 'invalid-code' },
    );
    render(<SignInScreen />);
    const codeInput = await reachCodeStep(email);
    typeInto(codeInput, code);
    await act(async () => {
      fireEvent.keyDown(codeInput, { key: 'Enter' });
    });
    expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
    // The verified screen navigates home once and announces no failure.
    expect(mockReplacedRoutes).toEqual(['/']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the quiz key bindings live outside the form (control for the cases below)', () => {
    renderWithQuizKeys();
    pressKeyOn(document.body, 'q');
    expect(keyHandlers.onToggleQuery).toHaveBeenCalledTimes(1);
    // The key was pressed outside the form, and none of it reached the email field.
    expect(document.activeElement).toBe(document.body);
    expect((screen.getByRole('textbox', { name: EMAIL_LABEL }) as HTMLInputElement).value).toBe('');
  });

  it.each(['a', 't', 'q', '1', 'Escape'])('typing %p into the email field fires no quiz key binding', (key) => {
    renderWithQuizKeys();
    const emailInput = screen.getByRole('textbox', { name: EMAIL_LABEL });
    emailInput.focus();
    pressKeyOn(emailInput, key);
    expectNoQuizBindingFired();
  });

  it('typing digits and Enter into the code field fires no quiz key binding', async () => {
    mockVerifyCode.mockResolvedValue({ isOk: false, reason: 'invalid-code' });
    renderWithQuizKeys();
    const codeInput = await reachCodeStep(buildEmail());
    codeInput.focus();
    for (const key of ['1', '2', 't', 'Enter']) pressKeyOn(codeInput, key);
    await act(async () => undefined);
    expectNoQuizBindingFired();
  });

  it('runs no CSS animation on either step under reduced motion', async () => {
    const matchMedia = jest.fn((query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia, writable: true });
    const { container } = render(<SignInScreen />);
    // Computed style, not the inline style alone, so a stylesheet rule counts;
    // and no animate- utility class, so a Tailwind animation counts too.
    function listAnimatedElements(): string[] {
      return Array.from(container.querySelectorAll('*'))
        .filter((element) => {
          const { animationName } = window.getComputedStyle(element);
          const hasAnimationName = animationName !== '' && animationName !== 'none';
          return hasAnimationName || /(^|\s|:)animate-/.test(element.getAttribute('class') ?? '');
        })
        .map((element) => element.outerHTML.slice(0, 120));
    }
    expect(container.querySelectorAll('*').length).toBeGreaterThan(0);
    expect(listAnimatedElements()).toEqual([]);
    await reachCodeStep(buildEmail());
    expect(listAnimatedElements()).toEqual([]);
  });
});
