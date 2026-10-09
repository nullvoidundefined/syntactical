// The email input on native: every place the app asks for an email shows a visible
// "Email address" label, hidden from assistive technology so the input's own aria-label is the one
// announced name, and the input class names keep it as wide as the password input.
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
    expect(screen.getByText('Email address', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });

  it('exposes the name "Email address" once: the visible label text is hidden from assistive technology', async () => {
    await renderStep();
    expect(screen.queryAllByText('Email address')).toHaveLength(0);
    const label = screen.getByText('Email address', { includeHiddenElements: true });
    expect(label.props['aria-hidden']).toBe(true);
    expect(screen.getAllByLabelText('Email address')).toHaveLength(1);
  });
});

// This is a class-presence guard on the source text, not a layout check: it cannot tell whether
// the input really renders full width, only that the w-full classes are still there.
describe('the email input width classes (source-text class-presence guard, not a layout check)', () => {
  it('keeps w-full on the wrapper and the input, and no fixed width on the password input', () => {
    const field = readFileSync(join(__dirname, '..', 'EmailField.tsx'), 'utf8');
    expect(field).toMatch(/<View className="[^"]*\bw-full\b/);
    expect(field).toMatch(/<TextInput[^>]*className="[^"]*\bw-full\b/s);
    const password = readFileSync(join(__dirname, '..', 'PasswordField.tsx'), 'utf8');
    // The password input fills its wrapper View, which stretches in the column.
    expect(password).toMatch(/<View className="mt-\d">/);
    expect(password).not.toMatch(/<TextInput[^>]*className="[^"]*\bw-(?!full)\S+/s);
  });
});
