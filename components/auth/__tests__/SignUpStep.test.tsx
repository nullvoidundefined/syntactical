// SignUpStep on native (Task 7.8; B-87, B-89): the first sign-up step holds an
// email field and a new-password field (autoComplete "new-password",
// textContentType "newPassword", hidden by default) with the hint "At least
// 12 characters. Spaces are fine." tied to the field by aria-describedby, and
// a "Create account" button. Both values are held by the parent; "Create
// account" and the return key in either field call onSubmit once, never while
// busy; an error id from the parent is tied to the password field beside the
// hint. Values are built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { SignUpStep } from '../SignUpStep';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: () => undefined, navigate: () => undefined, push: () => undefined, replace: () => undefined },
}));

const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const CREATE_ACCOUNT = 'Create account';
const HINT = 'At least 12 characters. Spaces are fine.';

function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

type Handlers = {
  onChangeEmail: jest.Mock;
  onChangePassword: jest.Mock;
  onSubmit: jest.Mock;
};

function buildHandlers(): Handlers {
  return { onChangeEmail: jest.fn(), onChangePassword: jest.fn(), onSubmit: jest.fn() };
}

type StepOptions = { email?: string; errorId?: string; isBusy?: boolean; password?: string };

async function renderStep(handlers: Handlers, options: StepOptions = {}) {
  const { email = buildEmail(), errorId, isBusy = false, password = buildPassword() } = options;
  return render(<SignUpStep email={email} errorId={errorId} isBusy={isBusy} password={password} {...handlers} />);
}

function readDescribedByIds(element: ReturnType<typeof screen.getByLabelText>): string[] {
  const raw = element.props['aria-describedby'] ?? element.props.accessibilityDescribedBy ?? '';
  return String(raw)
    .split(/\s+/)
    .filter((id) => id !== '');
}

function readHintId(): string {
  const hint = screen.getByText(HINT);
  const id = hint.props.nativeID ?? hint.props.id;
  expect(typeof id).toBe('string');
  expect(id).not.toBe('');
  return id as string;
}

describe('SignUpStep', () => {
  it('renders the email field and a hidden new-password field with the values held by the parent', async () => {
    const email = buildEmail();
    const password = buildPassword();
    await renderStep(buildHandlers(), { email, password });
    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe(email);
    const passwordInput = screen.getByLabelText(PASSWORD_LABEL);
    expect(passwordInput.props.value).toBe(password);
    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoComplete).toBe('new-password');
    expect(passwordInput.props.textContentType).toBe('newPassword');
    expect(screen.getByRole('button', { name: CREATE_ACCOUNT })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
  });

  it('shows the hint and ties it to the password field by aria-describedby', async () => {
    await renderStep(buildHandlers());
    const hintId = readHintId();
    expect(readDescribedByIds(screen.getByLabelText(PASSWORD_LABEL))).toContain(hintId);
  });

  it('ties both the hint and the error id from the parent to the password field', async () => {
    const errorId = `sign-up-error-${randomInt(1000, 9999)}`;
    await renderStep(buildHandlers(), { errorId });
    const ids = readDescribedByIds(screen.getByLabelText(PASSWORD_LABEL));
    expect(ids).toContain(readHintId());
    expect(ids).toContain(errorId);
  });

  it('reports the typed email and password through their change handlers, untrimmed', async () => {
    const handlers = buildHandlers();
    const email = buildEmail();
    const password = ` ${buildPassword()} `;
    await renderStep(handlers, { email: '', password: '' });
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
    expect(handlers.onChangeEmail).toHaveBeenLastCalledWith(email);
    expect(handlers.onChangePassword).toHaveBeenLastCalledWith(password);
  });

  it('calls onSubmit once when "Create account" is pressed', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACCOUNT }));
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([EMAIL_LABEL, PASSWORD_LABEL])('calls onSubmit once from the return key in the %s field', async (label) => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent(screen.getByLabelText(label), 'submitEditing');
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit while busy, from "Create account" or the return key in either field', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers, { isBusy: true });
    expect(screen.getByRole('button', { name: CREATE_ACCOUNT })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACCOUNT }));
    await fireEvent(screen.getByLabelText(PASSWORD_LABEL), 'submitEditing');
    await fireEvent(screen.getByLabelText(EMAIL_LABEL), 'submitEditing');
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the typed password when "Show password" is pressed, and submits nothing', async () => {
    const handlers = buildHandlers();
    const password = buildPassword();
    await renderStep(handlers, { password });
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    const passwordInput = screen.getByLabelText(PASSWORD_LABEL);
    expect(passwordInput.props.secureTextEntry).toBe(false);
    expect(passwordInput.props.value).toBe(password);
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(handlers.onChangePassword).not.toHaveBeenCalled();
  });
});
