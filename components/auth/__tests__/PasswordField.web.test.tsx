// PasswordField on the web (Task 7.7; B-57, B-86, B-89): a labeled
// <input type="password"> with the autocomplete value password managers read,
// a show-password toggle that is a native button with aria-pressed matching
// its state and focus returned to the input after each toggle, an error tied
// to the input through aria-describedby, and no quiz key binding firing while
// the field has focus. Values are built at run time.
import { randomBytes } from 'node:crypto';
import { useState } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { Text, View } from 'react-native';

import { useKeyboardNav } from '../../../state/useKeyboardNav';
import { PasswordField } from '../PasswordField';

const LABEL = 'Password';
const SHOW = 'Show password';
const HIDE = 'Hide password';
const ERROR_ID = 'password-field-error';
const ERROR_MESSAGE = 'That email and password do not match. Try again, or use a code instead.';

function buildPassword(): string {
  return `${randomBytes(6).toString('hex')} ${randomBytes(6).toString('base64url')}`;
}

type HarnessProps = {
  autoComplete: 'current-password' | 'new-password';
  errorMessage?: string;
  initialValue?: string;
};

// A controlled parent that, like the screens, renders the alert region the
// field's errorId names.
function Harness({ autoComplete, errorMessage, initialValue = '' }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <View>
      {errorMessage === undefined ? null : (
        <View accessible role="alert" nativeID={ERROR_ID}>
          <Text>{errorMessage}</Text>
        </View>
      )}
      <PasswordField
        label={LABEL}
        autoComplete={autoComplete}
        value={value}
        onChangeText={setValue}
        errorId={errorMessage === undefined ? undefined : ERROR_ID}
      />
    </View>
  );
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText(LABEL, { selector: 'input' }) as HTMLInputElement;
}

function readDescription(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
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

describe('PasswordField on the web', () => {
  it('renders a visible label and an input named by it', () => {
    render(<Harness autoComplete="current-password" />);
    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(getInput().tagName).toBe('INPUT');
  });

  it('renders type="password" and autocomplete="current-password" while hidden', () => {
    render(<Harness autoComplete="current-password" />);
    const input = getInput();
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
  });

  it('renders autocomplete="new-password" when passed', () => {
    render(<Harness autoComplete="new-password" />);
    const input = getInput();
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
  });

  it('has a native "Show password" button with aria-pressed="false", reachable by Tab', () => {
    render(<Harness autoComplete="current-password" />);
    const toggle = screen.getByRole('button', { name: SHOW });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.tabIndex).toBe(0);
    expect(toggle.hasAttribute('disabled')).toBe(false);
  });

  it('shows the value on toggle, renames the button "Hide password" with aria-pressed="true", keeps the value, and returns focus to the input', () => {
    const password = buildPassword();
    render(<Harness autoComplete="current-password" initialValue={password} />);
    const toggle = screen.getByRole('button', { name: SHOW });
    // A pointer or keyboard press moves focus to the button first.
    act(() => toggle.focus());
    act(() => toggle.click());

    const input = getInput();
    expect(input.getAttribute('type')).not.toBe('password');
    expect(input.value).toBe(password);
    const hide = screen.getByRole('button', { name: HIDE });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: SHOW })).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('hides the value again on a second toggle, keeps it, and returns focus to the input', () => {
    const password = buildPassword();
    render(<Harness autoComplete="new-password" initialValue={password} />);
    act(() => screen.getByRole('button', { name: SHOW }).click());
    const hide = screen.getByRole('button', { name: HIDE });
    act(() => hide.focus());
    act(() => hide.click());

    const input = getInput();
    expect(input.getAttribute('type')).toBe('password');
    expect(input.value).toBe(password);
    expect(screen.getByRole('button', { name: SHOW }).getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(input);
  });

  it('keeps a value typed after the toggle', () => {
    const password = buildPassword();
    render(<Harness autoComplete="current-password" />);
    act(() => screen.getByRole('button', { name: SHOW }).click());
    fireEvent.change(getInput(), { target: { value: password } });
    act(() => screen.getByRole('button', { name: HIDE }).click());
    expect(getInput().value).toBe(password);
  });

  it('names the role="alert" element holding the error in the input\'s aria-describedby', () => {
    render(<Harness autoComplete="current-password" errorMessage={ERROR_MESSAGE} />);
    const input = getInput();
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(/\s+/);
    const alert = screen.getByRole('alert');
    expect(describedBy).toContain(alert.id);
    expect(readDescription(input)).toContain(ERROR_MESSAGE);
  });

  it('carries no error description when there is no error', () => {
    render(<Harness autoComplete="current-password" />);
    expect(readDescription(getInput())).not.toContain(ERROR_MESSAGE);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('quiz key bindings (B-57)', () => {
    function renderWithQuizKeys(initialValue = '') {
      render(
        <>
          <Harness autoComplete="current-password" initialValue={initialValue} />
          <QuizKeysHarness />
        </>,
      );
    }

    it('fire outside the field (control for the cases below)', () => {
      renderWithQuizKeys();
      pressKeyOn(document.body, 'q');
      expect(keyHandlers.onToggleQuery).toHaveBeenCalledTimes(1);
    });

    it.each(['a', 't', 'f', 'q', '1', '4', 'Enter', 'Escape'])(
      'pressing %p while the hidden field has focus fires none',
      (key) => {
        renderWithQuizKeys();
        const input = getInput();
        act(() => input.focus());
        pressKeyOn(input, key);
        for (const handler of Object.values(keyHandlers)) expect(handler).not.toHaveBeenCalled();
      },
    );

    it.each(['t', 'q', 'Enter'])('pressing %p while the shown field has focus fires none', (key) => {
      renderWithQuizKeys(buildPassword());
      act(() => screen.getByRole('button', { name: SHOW }).click());
      const input = getInput();
      act(() => input.focus());
      pressKeyOn(input, key);
      for (const handler of Object.values(keyHandlers)) expect(handler).not.toHaveBeenCalled();
    });
  });
});
