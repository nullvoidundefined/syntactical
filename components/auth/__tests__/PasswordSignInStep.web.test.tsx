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

// The real <form> on the web (PR 104, owner decision): Safari and Firefox offer
// to save a password only after a form submission, so the email and password
// inputs sit in exactly one <form>, "Sign in" is its submit button, every
// other control is a non-submit button, and each submit has its default
// prevented so the browser never navigates or puts the password in a URL.
describe('PasswordSignInStep on the web, inside a real form', () => {
  const SHOW = 'Show password';

  // Every submit event that reaches the document, with whether its default was
  // prevented. React handles events at its root, so this listener runs after it.
  let submits: boolean[] = [];
  function recordSubmit(event: Event) {
    submits.push(event.defaultPrevented);
  }
  beforeEach(() => {
    submits = [];
    document.addEventListener('submit', recordSubmit);
  });
  afterEach(() => {
    document.removeEventListener('submit', recordSubmit);
  });

  function getOnlyForm(): HTMLFormElement {
    const forms = document.querySelectorAll('form');
    expect(forms).toHaveLength(1);
    return forms[0];
  }

  function getButton(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
  }

  // What a browser does for Enter in a text field: keydown reaches the field,
  // and unless its default is prevented the browser submits the field's form
  // (implicit submission). jsdom does not, so the submit is sent here.
  function pressEnterInField(input: HTMLInputElement) {
    act(() => input.focus());
    act(() => {
      const isNotPrevented = fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      if (isNotPrevented && input.form !== null) fireEvent.submit(input.form);
    });
  }

  it('puts the email and password inputs in exactly one <form>, with "Sign in" as its submit button', () => {
    renderStep(buildHandlers());
    const form = getOnlyForm();
    expect(form.contains(getEmailInput())).toBe(true);
    expect(form.contains(getPasswordInput())).toBe(true);
    const signIn = getButton(SIGN_IN);
    expect(signIn.tagName).toBe('BUTTON');
    expect(signIn.type).toBe('submit');
    expect(form.contains(signIn)).toBe(true);
  });

  it.each([USE_CODE, FORGOT, SHOW])('makes "%s" a non-submit button: type="button" or outside the form', (name) => {
    renderStep(buildHandlers());
    const form = getOnlyForm();
    const button = getButton(name);
    expect(button.type === 'button' || !form.contains(button)).toBe(true);
  });

  it('gives the form no action and no GET method, so the password can never land in a URL', () => {
    renderStep(buildHandlers());
    const form = getOnlyForm();
    expect(form.hasAttribute('action')).toBe(false);
    expect((form.getAttribute('method') ?? '').toLowerCase()).not.toBe('get');
  });

  it('calls onSubmit once when the form is submitted, with the default prevented', () => {
    const handlers = buildHandlers();
    renderStep(handlers);
    act(() => {
      fireEvent.submit(getOnlyForm());
    });
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(submits).toEqual([true]);
  });

  it('submits the form once when "Sign in" is clicked: one onSubmit call and one prevented submit event', () => {
    const handlers = buildHandlers();
    renderStep(handlers);
    act(() => {
      fireEvent.click(getButton(SIGN_IN));
    });
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(submits).toEqual([true]);
  });

  it.each([
    ['email', getEmailInput],
    ['password', getPasswordInput],
  ] as const)('calls onSubmit once for Enter in the %s field, with any submit prevented', (_label, getInput) => {
    const handlers = buildHandlers();
    renderStep(handlers);
    expect(getOnlyForm().contains(getInput())).toBe(true);
    pressEnterInField(getInput());
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(submits.every((isPrevented) => isPrevented)).toBe(true);
  });

  it('does not call onSubmit while busy when the form is submitted, and still prevents the default', () => {
    const handlers = buildHandlers();
    renderStep(handlers, true);
    act(() => {
      fireEvent.submit(getOnlyForm());
    });
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(submits).toEqual([true]);
  });

  it('toggles the password with "Show password" inside the form without submitting it', () => {
    const handlers = buildHandlers();
    renderStep(handlers);
    expect(getOnlyForm().contains(getPasswordInput())).toBe(true);
    act(() => {
      fireEvent.click(getButton(SHOW));
    });
    expect(getButton('Hide password').getAttribute('aria-pressed')).toBe('true');
    expect(getPasswordInput().getAttribute('type')).not.toBe('password');
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(submits).toEqual([]);
  });

  it.each([
    [USE_CODE, 'onUseCode'],
    [FORGOT, 'onForgotPassword'],
  ] as const)('clicking "%s" calls only its handler and never submits the form', (name, handlerName) => {
    const handlers = buildHandlers();
    renderStep(handlers);
    expect(getOnlyForm().contains(getEmailInput())).toBe(true);
    act(() => {
      fireEvent.click(getButton(name));
    });
    expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(submits).toEqual([]);
  });
});
