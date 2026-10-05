// PasswordField on native (Task 7.7; B-86, B-89): a visible label naming the
// input, the value hidden by default, autofill hints for the platform
// password managers, and a show-password toggle that is a real button whose
// name follows its state and never changes the typed value. The value is
// built at run time; no password literal sits in source.
import { randomBytes } from 'node:crypto';
import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { PasswordField } from '../PasswordField';

const LABEL = 'Password';
const SHOW = 'Show password';
const HIDE = 'Hide password';

function buildPassword(): string {
  return `${randomBytes(6).toString('hex')} ${randomBytes(6).toString('base64url')}`;
}

type HarnessProps = {
  autoComplete: 'current-password' | 'new-password';
  errorId?: string;
  initialValue?: string;
  label?: string;
  onSubmitEditing?: () => void;
};

// A controlled parent, as the screens hold the value.
function Harness({ autoComplete, errorId, initialValue = '', label = LABEL, onSubmitEditing }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <PasswordField
      label={label}
      autoComplete={autoComplete}
      value={value}
      onChangeText={setValue}
      errorId={errorId}
      onSubmitEditing={onSubmitEditing}
    />
  );
}

describe('PasswordField on native', () => {
  it('shows its label as visible text and names the input with it', async () => {
    await render(<Harness autoComplete="current-password" label="Current password" />);
    expect(screen.getByText('Current password')).toBeTruthy();
    expect(screen.getByLabelText('Current password')).toBeTruthy();
  });

  it('hides the value by default', async () => {
    await render(<Harness autoComplete="current-password" />);
    expect(screen.getByLabelText(LABEL).props.secureTextEntry).toBe(true);
  });

  it('passes current-password autofill hints for a sign-in field', async () => {
    await render(<Harness autoComplete="current-password" />);
    const input = screen.getByLabelText(LABEL);
    expect(input.props.autoComplete).toBe('current-password');
    expect(input.props.textContentType).toBe('password');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
  });

  it('passes new-password autofill hints for a field that chooses a password', async () => {
    await render(<Harness autoComplete="new-password" />);
    const input = screen.getByLabelText(LABEL);
    expect(input.props.autoComplete).toBe('new-password');
    expect(input.props.textContentType).toBe('newPassword');
  });

  it('reports typed text to onChangeText unchanged, spaces included', async () => {
    const onChangeText = jest.fn();
    const password = ` ${buildPassword()} `;
    await render(<PasswordField label={LABEL} autoComplete="current-password" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText(LABEL), password);
    expect(onChangeText).toHaveBeenLastCalledWith(password);
  });

  it('has a toggle button named "Show password" that reveals the value, renames itself "Hide password", and keeps the value', async () => {
    const password = buildPassword();
    await render(<Harness autoComplete="current-password" initialValue={password} />);
    expect(screen.queryByRole('button', { name: HIDE })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: SHOW }));

    const input = screen.getByLabelText(LABEL);
    expect(input.props.secureTextEntry).toBe(false);
    expect(input.props.value).toBe(password);
    expect(screen.getByRole('button', { name: HIDE })).toBeTruthy();
    expect(screen.queryByRole('button', { name: SHOW })).toBeNull();
  });

  it('hides the value again on a second press and keeps the value', async () => {
    const password = buildPassword();
    await render(<Harness autoComplete="new-password" initialValue={password} />);
    await fireEvent.press(screen.getByRole('button', { name: SHOW }));
    await fireEvent.press(screen.getByRole('button', { name: HIDE }));
    const input = screen.getByLabelText(LABEL);
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.value).toBe(password);
    expect(screen.getByRole('button', { name: SHOW })).toBeTruthy();
  });

  it('runs onSubmitEditing from the keyboard return key', async () => {
    const onSubmitEditing = jest.fn();
    await render(<Harness autoComplete="current-password" onSubmitEditing={onSubmitEditing} />);
    await fireEvent(screen.getByLabelText(LABEL), 'submitEditing');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  it('describes the input by errorId when one is given', async () => {
    await render(<Harness autoComplete="current-password" errorId="sign-in-error" />);
    expect(screen.getByLabelText(LABEL).props['aria-describedby']).toContain('sign-in-error');
  });
});
