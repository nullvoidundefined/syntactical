import { randomInt } from 'node:crypto';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SignInScreen from '../sign-in';

// Sign-in route fixes on the web (B-64, Task 3.10, slice S4b): after the
// email step succeeds, focus moves to the code field, and the code field's
// accessible description carries the step's instruction text. Under reduced
// motion no element on either step runs a CSS animation, by computed style
// and by class name.

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { replace: () => undefined },
  useRouter: () => ({ replace: () => undefined }),
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
const CODE_INSTRUCTION = 'Enter the 6-digit code';

function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

async function reachCodeStep(email: string): Promise<HTMLElement> {
  mockRequestCode.mockResolvedValue({ isOk: true });
  // The screen opens on the password step (Task 7.7); "Use a code instead" opens the code steps.
  fireEvent.click(screen.getByRole('button', { name: 'Use a code instead' }));
  const emailInput = screen.getByRole('textbox', { name: EMAIL_LABEL });
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.keyDown(emailInput, { key: 'Enter' });
  return screen.findByLabelText(CODE_LABEL);
}

function readDescription(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

function emulateReducedMotion(): void {
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
}

function listAnimatedElements(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('*'))
    .filter((element) => {
      const { animationName } = window.getComputedStyle(element);
      const hasAnimationName = animationName !== '' && animationName !== 'none';
      const className = element.getAttribute('class') ?? '';
      return hasAnimationName || /(^|\s|:)animate-/.test(className);
    })
    .map((element) => element.outerHTML.slice(0, 120));
}

describe('sign-in route focus and motion on the web', () => {
  it('moves focus to the code field once the email step succeeds', async () => {
    render(<SignInScreen />);
    const codeInput = await reachCodeStep(buildEmail());
    await waitFor(() => expect(document.activeElement).toBe(codeInput));
  });

  it('describes the code field with the "Enter the 6-digit code" instruction', async () => {
    render(<SignInScreen />);
    const codeInput = await reachCodeStep(buildEmail());
    expect(readDescription(codeInput)).toContain(CODE_INSTRUCTION);
  });

  it('runs no animation by computed style or animate- class on either step under reduced motion', async () => {
    emulateReducedMotion();
    const { container } = render(<SignInScreen />);
    expect(container.querySelectorAll('*').length).toBeGreaterThan(0);
    expect(listAnimatedElements(container)).toEqual([]);
    await reachCodeStep(buildEmail());
    expect(listAnimatedElements(container)).toEqual([]);
  });
});
