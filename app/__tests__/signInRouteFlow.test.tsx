import { randomInt } from 'node:crypto';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import SignInScreen from '../sign-in';

// Sign-in route flow fixes (B-64, Task 3.10, slice S4b): an invalid email
// is announced without echoing it and keeps the email step; a failed resend
// keeps the code step and its typed field and restarts the 60-second
// cooldown, so it cannot be hammered; and a second submit while the first
// is in flight never reaches requestCode or verifyCode.

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
const INVALID_EMAIL_MESSAGE = 'That email address does not look right. Check it and try again.';
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

function expectAlertOmits(alert: ReturnType<typeof screen.getByRole>, values: string[]): void {
  for (const value of values) {
    expect(within(alert).queryByText(new RegExp(escapeForRegExp(value)))).toBeNull();
  }
}

type Deferred = { promise: Promise<AuthResult>; resolve: (result: AuthResult) => void };

function buildDeferred(): Deferred {
  let resolve: (result: AuthResult) => void = () => undefined;
  const promise = new Promise<AuthResult>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function reachCodeStep(email: string): Promise<void> {
  mockRequestCode.mockResolvedValue({ isOk: true });
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.press(screen.getByRole('button', { name: SEND_BUTTON }));
  expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
}

async function advanceSeconds(seconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

function resendButton() {
  return screen.getByRole('button', { name: new RegExp(RESEND_BUTTON) });
}

describe('sign-in route flow fixes', () => {
  it('announces an invalid email in an alert without echoing it, and stays on the email step', async () => {
    const email = buildEmail();
    mockRequestCode.mockResolvedValue({ isOk: false, reason: 'invalid-email' });
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
    await fireEvent.press(screen.getByRole('button', { name: SEND_BUTTON }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(INVALID_EMAIL_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [email]);
    expect(screen.getByLabelText(EMAIL_LABEL)).toBeTruthy();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
  });

  describe('failed resend', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it.each([
      ['rate-limited', RATE_LIMITED_MESSAGE],
      ['unavailable', UNAVAILABLE_MESSAGE],
    ] as const)(
      'a resend failing with %s shows the alert without the email, keeps the typed code, and restarts the 60-second cooldown',
      async (reason, message) => {
        const email = buildEmail();
        const partialCode = buildCode().slice(0, 3);
        await reachCodeStep(email);
        await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), partialCode);
        await advanceSeconds(RESEND_COOLDOWN_SECONDS);
        expect(resendButton()).toBeEnabled();

        mockRequestCode.mockResolvedValue({ isOk: false, reason });
        await fireEvent.press(resendButton());
        expect(mockRequestCode).toHaveBeenCalledTimes(2);

        const alert = screen.getByRole('alert');
        expect(within(alert).getByText(message)).toBeTruthy();
        expectAlertOmits(alert, [email]);
        expect(screen.getByLabelText(CODE_LABEL).props.value).toBe(partialCode);
        expect(resendButton()).toBeDisabled();
        expect(screen.getByText(new RegExp(`\\b${RESEND_COOLDOWN_SECONDS} seconds\\b`))).toBeTruthy();

        // The restarted cooldown holds: a press before it ends sends nothing.
        await advanceSeconds(RESEND_COOLDOWN_SECONDS - 1);
        expect(resendButton()).toBeDisabled();
        await fireEvent.press(resendButton());
        expect(mockRequestCode).toHaveBeenCalledTimes(2);
        await advanceSeconds(1);
        expect(resendButton()).toBeEnabled();
      },
    );
  });

  describe('a second submit while the first is in flight', () => {
    it('sends one request when Enter is pressed twice in the email field across a re-render', async () => {
      const pending = buildDeferred();
      mockRequestCode.mockReturnValue(pending.promise);
      await render(<SignInScreen />);
      const emailInput = screen.getByLabelText(EMAIL_LABEL);
      await fireEvent.changeText(emailInput, buildEmail());
      await fireEvent(emailInput, 'submitEditing');
      await fireEvent(screen.getByLabelText(EMAIL_LABEL), 'submitEditing');
      expect(mockRequestCode).toHaveBeenCalledTimes(1);
      await act(async () => pending.resolve({ isOk: true }));
      expect(mockRequestCode).toHaveBeenCalledTimes(1);
    });

    it('sends one request when Enter is pressed twice in the email field before React re-renders', async () => {
      const pending = buildDeferred();
      mockRequestCode.mockReturnValue(pending.promise);
      await render(<SignInScreen />);
      const emailInput = screen.getByLabelText(EMAIL_LABEL);
      await fireEvent.changeText(emailInput, buildEmail());
      await act(async () => {
        emailInput.props.onSubmitEditing();
        emailInput.props.onSubmitEditing();
      });
      expect(mockRequestCode).toHaveBeenCalledTimes(1);
      await act(async () => pending.resolve({ isOk: true }));
      expect(mockRequestCode).toHaveBeenCalledTimes(1);
    });

    it('verifies once when "Verify code" is pressed again during an in-flight verification', async () => {
      const email = buildEmail();
      const code = buildCode();
      const pending = buildDeferred();
      await reachCodeStep(email);
      mockVerifyCode.mockReturnValue(pending.promise);
      await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
      await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
      await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
      expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
      await act(async () => pending.resolve({ isOk: false, reason: 'invalid-code' }));
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });

    it('verifies once when the code is submitted twice before React re-renders', async () => {
      const email = buildEmail();
      const code = buildCode();
      const pending = buildDeferred();
      await reachCodeStep(email);
      mockVerifyCode.mockReturnValue(pending.promise);
      const codeInput = screen.getByLabelText(CODE_LABEL);
      await fireEvent.changeText(codeInput, code);
      await act(async () => {
        codeInput.props.onSubmitEditing();
        codeInput.props.onSubmitEditing();
      });
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
      expect(mockVerifyCode).toHaveBeenCalledWith(email, code);
      await act(async () => pending.resolve({ isOk: false, reason: 'invalid-code' }));
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });
  });
});
