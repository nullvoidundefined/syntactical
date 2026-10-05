// PasswordSignInStep on native (Task 7.7; B-86, B-89): the email field, the
// password field, and "Sign in"; "Sign in" calls onSubmit once and never while
// busy; "Use a code instead" and "Forgot password?" call their own handlers;
// the return key in the email field submits like the one in the password
// field; "Create an account" opens /sign-up. Values are built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { PasswordSignInStep } from '../PasswordSignInStep';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args), replace: () => undefined },
}));

const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const SIGN_IN = 'Sign in';
const USE_CODE = 'Use a code instead';
const FORGOT = 'Forgot password?';
const CREATE_ACCOUNT = 'Create an account';

function buildEmail(): string {
  return [`learner${randomInt(1000, 9999)}`, 'example.test'].join('@');
}

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

type Handlers = {
  onChangeEmail: jest.Mock;
  onChangePassword: jest.Mock;
  onForgotPassword: jest.Mock;
  onSubmit: jest.Mock;
  onUseCode: jest.Mock;
};

function buildHandlers(): Handlers {
  return {
    onChangeEmail: jest.fn(),
    onChangePassword: jest.fn(),
    onForgotPassword: jest.fn(),
    onSubmit: jest.fn(),
    onUseCode: jest.fn(),
  };
}

async function renderStep(handlers: Handlers, isBusy = false, email = buildEmail(), typedPassword = buildPassword()) {
  return render(<PasswordSignInStep email={email} isBusy={isBusy} password={typedPassword} {...handlers} />);
}

describe('PasswordSignInStep', () => {
  it('renders the email field, the password field, and "Sign in" with the values held by the parent', async () => {
    const email = buildEmail();
    const typedPassword = buildPassword();
    await renderStep(buildHandlers(), false, email, typedPassword);
    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe(email);
    expect(screen.getByLabelText(PASSWORD_LABEL).props.value).toBe(typedPassword);
    expect(screen.getByLabelText(PASSWORD_LABEL).props.secureTextEntry).toBe(true);
    expect(screen.getByRole('button', { name: SIGN_IN })).toBeTruthy();
  });

  it('reports typed email and password through their change handlers', async () => {
    const handlers = buildHandlers();
    const email = buildEmail();
    const typedPassword = buildPassword();
    await renderStep(handlers, false, '', '');
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), typedPassword);
    expect(handlers.onChangeEmail).toHaveBeenLastCalledWith(email);
    expect(handlers.onChangePassword).toHaveBeenLastCalledWith(typedPassword);
  });

  it('calls onSubmit once when "Sign in" is pressed', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN }));
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit while busy, from "Sign in" or from the return key in either field', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers, true);
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN }));
    await fireEvent(screen.getByLabelText(PASSWORD_LABEL), 'submitEditing');
    await fireEvent(screen.getByLabelText(EMAIL_LABEL), 'submitEditing');
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit once from the return key in the password field', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent(screen.getByLabelText(PASSWORD_LABEL), 'submitEditing');
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit once from the return key in the email field', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent(screen.getByLabelText(EMAIL_LABEL), 'submitEditing');
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onUseCode, and nothing else, from "Use a code instead"', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE }));
    expect(handlers.onUseCode).toHaveBeenCalledTimes(1);
    expect(handlers.onForgotPassword).not.toHaveBeenCalled();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('calls onForgotPassword, and nothing else, from "Forgot password?"', async () => {
    const handlers = buildHandlers();
    await renderStep(handlers);
    await fireEvent.press(screen.getByRole('button', { name: FORGOT }));
    expect(handlers.onForgotPassword).toHaveBeenCalledTimes(1);
    expect(handlers.onUseCode).not.toHaveBeenCalled();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('opens /sign-up once from "Create an account"', async () => {
    await renderStep(buildHandlers());
    await fireEvent.press(screen.getByRole('link', { name: CREATE_ACCOUNT }));
    expect(mockPush.mock.calls).toEqual([['/sign-up']]);
  });
});
