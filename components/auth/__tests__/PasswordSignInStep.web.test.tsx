// PasswordSignInStep on the web (Task 7.7; B-64, B-86, B-89): the email and
// password inputs and a native "Sign in" button; "Sign in" calls onSubmit once
// and never while busy; Enter in the email field submits like Enter in the
// password field; "Use a code instead" and "Forgot password?" call their own
// handlers; "Create an account" is a real <a href="/sign-up">, where a plain
// click navigates in-app with the browser's navigation cancelled, and a
// modified or middle-button click is left to the browser (a new tab or
// window) with no in-app navigation. Values are built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import { act, fireEvent, render, screen } from '@testing-library/react';

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

function renderStep(handlers: Handlers, isBusy = false) {
  return render(<PasswordSignInStep email={buildEmail()} isBusy={isBusy} password={buildPassword()} {...handlers} />);
}

function getEmailInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: EMAIL_LABEL }) as HTMLInputElement;
}

function getPasswordInput(): HTMLInputElement {
  return screen.getByLabelText(PASSWORD_LABEL, { selector: 'input' }) as HTMLInputElement;
}

function getCreateAccount(): HTMLElement {
  return screen.getByRole('link', { name: CREATE_ACCOUNT });
}

// fireEvent returns dispatchEvent's result: false when a handler called preventDefault.
function clickIsDefaultPrevented(element: HTMLElement, init: MouseEventInit = {}): boolean {
  let isNotPrevented = true;
  act(() => {
    isNotPrevented = fireEvent.click(element, init);
  });
  return !isNotPrevented;
}

beforeEach(() => {
  mockPush.mockReset();
});

describe('PasswordSignInStep on the web', () => {
  it('renders an email input, a password input of type password, and a native "Sign in" button', () => {
    renderStep(buildHandlers());
    expect(getEmailInput().tagName).toBe('INPUT');
    expect(getPasswordInput().getAttribute('type')).toBe('password');
    expect(screen.getByRole('button', { name: SIGN_IN }).tagName).toBe('BUTTON');
  });

  it('calls onSubmit once when "Sign in" is clicked', () => {
    const handlers = buildHandlers();
    renderStep(handlers);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: SIGN_IN }));
    });
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit while busy, from "Sign in" or from Enter in either field', () => {
    const handlers = buildHandlers();
    renderStep(handlers, true);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: SIGN_IN }));
      fireEvent.keyDown(getPasswordInput(), { key: 'Enter' });
      fireEvent.keyDown(getEmailInput(), { key: 'Enter' });
    });
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit once from Enter in the email field', () => {
    const handlers = buildHandlers();
    renderStep(handlers);
    act(() => {
      fireEvent.keyDown(getEmailInput(), { key: 'Enter' });
    });
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    [USE_CODE, 'onUseCode'],
    [FORGOT, 'onForgotPassword'],
  ] as const)("calls only %s's handler when it is clicked", (name, handlerName) => {
    const handlers = buildHandlers();
    renderStep(handlers);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
    expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
    for (const [otherName, handler] of Object.entries(handlers)) {
      if (otherName !== handlerName) expect(handler).not.toHaveBeenCalled();
    }
  });

  describe('"Create an account"', () => {
    it('renders as an <a> with href "/sign-up"', () => {
      renderStep(buildHandlers());
      const link = getCreateAccount();
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/sign-up');
    });

    it('navigates in-app once on a plain click, with the browser default prevented', () => {
      renderStep(buildHandlers());
      const isPrevented = clickIsDefaultPrevented(getCreateAccount(), { button: 0 });
      expect(mockPush.mock.calls).toEqual([['/sign-up']]);
      expect(isPrevented).toBe(true);
    });

    it.each([
      ['metaKey', { button: 0, metaKey: true }],
      ['ctrlKey', { button: 0, ctrlKey: true }],
      ['shiftKey', { button: 0, shiftKey: true }],
      ['a middle-button click', { button: 1 }],
    ] as const)(
      'leaves a click with %s to the browser: no in-app navigation and no default prevented',
      (_label, init) => {
        renderStep(buildHandlers());
        const isPrevented = clickIsDefaultPrevented(getCreateAccount(), init);
        expect(mockPush).not.toHaveBeenCalled();
        expect(isPrevented).toBe(false);
      },
    );
  });
});
