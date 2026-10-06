// The email input on native: every place the app asks for an email shows a visible
// "Email address" label tied to the input, and the input is as wide as the password input.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react-native';

import { EmailStep } from '../EmailStep';
import { PasswordSignInStep } from '../PasswordSignInStep';
import { SignUpStep } from '../SignUpStep';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: () => undefined, replace: () => undefined },
}));

const noop = () => undefined;

async function renderSignIn() {
  return await render(
    <PasswordSignInStep
      email=""
      isBusy={false}
      onChangeEmail={noop}
      onChangePassword={noop}
      onForgotPassword={noop}
      onSubmit={noop}
      onUseCode={noop}
      password=""
    />,
  );
}

async function renderSignUp() {
  return await render(
    <SignUpStep email="" isBusy={false} onChangeEmail={noop} onChangePassword={noop} onSubmit={noop} password="" />,
  );
}

async function renderCodeEmail() {
  return await render(<EmailStep isBusy={false} onSubmit={noop} />);
}

describe.each([
  ['sign-in password step', renderSignIn],
  ['sign-up step', renderSignUp],
  ['sign-in code email step', renderCodeEmail],
])('the email input on the %s', (_name, renderStep) => {
  it('has the visible text "Email address" and is found by that label', async () => {
    await renderStep();
    expect(screen.getByText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });
});

describe('the email input width', () => {
  it('stretches to the column like the password input: wrapper and input are both w-full', () => {
    const field = readFileSync(join(__dirname, '..', 'EmailField.tsx'), 'utf8');
    expect(field).toMatch(/<View className="[^"]*\bw-full\b/);
    expect(field).toMatch(/<TextInput[^>]*className="[^"]*\bw-full\b/s);
    const password = readFileSync(join(__dirname, '..', 'PasswordField.tsx'), 'utf8');
    // The password input fills its wrapper View, which stretches in the column.
    expect(password).toMatch(/<View className="mt-\d">/);
    expect(password).not.toMatch(/<TextInput[^>]*className="[^"]*\bw-(?!full)\S+/s);
  });
});
