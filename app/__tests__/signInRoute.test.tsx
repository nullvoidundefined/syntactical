import { randomInt } from 'node:crypto';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import SignInScreen from '../sign-in';

// The sign-in route (B-64, Task 3.10): one h1, an email step then a code
// step with labeled inputs, errors announced in a role="alert" region that
// never echoes the email or the code, a 60-second resend cooldown, and a
// replace navigation home after a successful verification.

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useRouter: () => ({ replace: (...args: unknown[]) => mockReplace(...args) }),
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
const SEND_BUTTON = 'Send code';
const VERIFY_BUTTON = 'Verify code';
const RESEND_BUTTON = 'Resend code';
const INVALID_CODE_MESSAGE = 'That code did not work. Check the newest email and try again.';
const RATE_LIMITED_MESSAGE = 'Too many attempts. Wait a few minutes, then try again.';
const UNAVAILABLE_MESSAGE = 'Sign-in is unavailable right now. Try again later.';
const RESEND_COOLDOWN_SECONDS = 60;

// Built at run time: neither value is a literal in the source.
function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
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

async function submitEmail(email: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.press(screen.getByRole('button', { name: SEND_BUTTON }));
}

async function reachCodeStep(email: string): Promise<void> {
  mockRequestCode.mockResolvedValue({ isOk: true });
  await render(<SignInScreen />);
  await submitEmail(email);
  expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
}

async function submitCode(code: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
  await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
}

// One second per act, so a countdown built from chained timeouts and one
// built from an interval both re-render between ticks.
async function advanceSeconds(seconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

function expectAlertOmits(alert: ReturnType<typeof screen.getByRole>, values: string[]): void {
  for (const value of values) {
    expect(within(alert).queryByText(new RegExp(escapeForRegExp(value)))).toBeNull();
  }
}

describe('sign-in route', () => {
  it('renders exactly one h1 "Sign in" and a labeled email input with a submit button', async () => {
    await render(<SignInScreen />);
    expect(listLevelOneHeadings()).toEqual(['Sign in']);
    expect(screen.getByLabelText(EMAIL_LABEL)).toBeTruthy();
    expect(screen.getByRole('button', { name: SEND_BUTTON })).toBeTruthy();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
  });

  it('sends the typed email and moves to a labeled code step that keeps one h1', async () => {
    const email = buildEmail();
    await reachCodeStep(email);
    expect(mockRequestCode).toHaveBeenCalledWith(email);
    expect(listLevelOneHeadings()).toEqual(['Sign in']);
    expect(screen.getByRole('button', { name: VERIFY_BUTTON })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('submits the email step from the keyboard return key', async () => {
    mockRequestCode.mockResolvedValue({ isOk: true });
    const email = buildEmail();
    await render(<SignInScreen />);
    const emailInput = screen.getByLabelText(EMAIL_LABEL);
    await fireEvent.changeText(emailInput, email);
    await fireEvent(emailInput, 'submitEditing');
    expect(mockRequestCode).toHaveBeenCalledWith(email);
    expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
  });

  it('submits the code step from the keyboard return key with the email and the code', async () => {
    const email = buildEmail();
    const code = buildCode();
    mockVerifyCode.mockResolvedValue({ isOk: true });
    await reachCodeStep(email);
    const codeInput = screen.getByLabelText(CODE_LABEL);
    await fireEvent.changeText(codeInput, code);
    await fireEvent(codeInput, 'submitEditing');
    expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
  });

  it('replaces the route with home after a successful verification', async () => {
    const email = buildEmail();
    const code = buildCode();
    mockVerifyCode.mockResolvedValue({ isOk: true });
    await reachCodeStep(email);
    await submitCode(code);
    expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces an invalid code in an alert without echoing the email or the code, and stays on the code step', async () => {
    const email = buildEmail();
    const code = buildCode();
    mockVerifyCode.mockResolvedValue({ isOk: false, reason: 'invalid-code' });
    await reachCodeStep(email);
    await submitCode(code);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(INVALID_CODE_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [email, code]);
    expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('announces a rate limit in an alert distinct from the invalid-code message, without echoing the email', async () => {
    const email = buildEmail();
    mockRequestCode.mockResolvedValue({ isOk: false, reason: 'rate-limited' });
    await render(<SignInScreen />);
    await submitEmail(email);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(RATE_LIMITED_MESSAGE)).toBeTruthy();
    expect(within(alert).queryByText(INVALID_CODE_MESSAGE)).toBeNull();
    expectAlertOmits(alert, [email]);
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
  });

  it('announces an unavailable service in an alert distinct from the other two messages, without echoing the email', async () => {
    const email = buildEmail();
    mockRequestCode.mockResolvedValue({ isOk: false, reason: 'unavailable' });
    await render(<SignInScreen />);
    await submitEmail(email);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(UNAVAILABLE_MESSAGE)).toBeTruthy();
    expect(within(alert).queryByText(RATE_LIMITED_MESSAGE)).toBeNull();
    expect(within(alert).queryByText(INVALID_CODE_MESSAGE)).toBeNull();
    expectAlertOmits(alert, [email]);
  });

  it('announces a rate limit on the code step without echoing the email or the code', async () => {
    const email = buildEmail();
    const code = buildCode();
    mockVerifyCode.mockResolvedValue({ isOk: false, reason: 'rate-limited' });
    await reachCodeStep(email);
    await submitCode(code);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(RATE_LIMITED_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [email, code]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  describe('resend cooldown', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('disables "Resend code" for 60 seconds with a visible countdown, then enables it', async () => {
      await reachCodeStep(buildEmail());
      const resendButton = () => screen.getByRole('button', { name: new RegExp(RESEND_BUTTON) });
      expect(resendButton()).toBeDisabled();
      expect(screen.getByText(new RegExp(`\\b${RESEND_COOLDOWN_SECONDS} seconds\\b`))).toBeTruthy();

      await advanceSeconds(1);
      expect(screen.getByText(new RegExp(`\\b${RESEND_COOLDOWN_SECONDS - 1} seconds\\b`))).toBeTruthy();
      expect(resendButton()).toBeDisabled();

      await advanceSeconds(RESEND_COOLDOWN_SECONDS - 2);
      expect(screen.getByText(/\b1 seconds?\b/)).toBeTruthy();
      expect(resendButton()).toBeDisabled();

      await advanceSeconds(1);
      expect(resendButton()).toBeEnabled();
      expect(screen.queryByText(/\b\d+ seconds?\b/)).toBeNull();
    });

    it('ignores a press on "Resend code" during the cooldown', async () => {
      await reachCodeStep(buildEmail());
      await advanceSeconds(10);
      await fireEvent.press(screen.getByRole('button', { name: new RegExp(RESEND_BUTTON) }));
      expect(mockRequestCode).toHaveBeenCalledTimes(1);
    });

    it('requests a new code for the same email after the cooldown and restarts it', async () => {
      const email = buildEmail();
      await reachCodeStep(email);
      await advanceSeconds(RESEND_COOLDOWN_SECONDS);
      const resendButton = () => screen.getByRole('button', { name: new RegExp(RESEND_BUTTON) });
      expect(resendButton()).toBeEnabled();

      await fireEvent.press(resendButton());
      expect(mockRequestCode).toHaveBeenCalledTimes(2);
      expect(mockRequestCode).toHaveBeenLastCalledWith(email);
      expect(resendButton()).toBeDisabled();
      expect(screen.getByText(new RegExp(`\\b${RESEND_COOLDOWN_SECONDS} seconds\\b`))).toBeTruthy();
      expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();

      await advanceSeconds(RESEND_COOLDOWN_SECONDS);
      expect(resendButton()).toBeEnabled();
    });
  });
});
