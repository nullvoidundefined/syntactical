// The email input on the web: a real <label for> element carries the visible text and points
// at the input, in every step that asks for an email, and the code field is labeled the same way.
import { render, screen } from '@testing-library/react';

import { CodeStep } from '../CodeStep';
import { EmailStep } from '../EmailStep';
import { PasswordSignInStep } from '../PasswordSignInStep';
import { SignUpStep } from '../SignUpStep';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: () => undefined, replace: () => undefined },
}));

const noop = () => undefined;

function renderSignIn() {
  return render(
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

function renderSignUp() {
  return render(
    <SignUpStep email="" isBusy={false} onChangeEmail={noop} onChangePassword={noop} onSubmit={noop} password="" />,
  );
}

function renderCodeEmail() {
  return render(<EmailStep isBusy={false} onSubmit={noop} />);
}

describe.each([
  ['sign-in password step', renderSignIn],
  ['sign-up step', renderSignUp],
  ['sign-in code email step', renderCodeEmail],
])('the email input on the %s', (_name, renderStep) => {
  it('has a visible <label for> element, not only an aria-label', () => {
    const { container } = renderStep();
    const input = screen.getByLabelText('Email address');
    const label = container.querySelector('label');
    expect(label?.textContent).toBe('Email address');
    expect(label?.getAttribute('for')).toBe(input.id);
    expect(input.id).not.toBe('');
  });
});

describe('the sign-in code input', () => {
  it('has a visible <label for> element tied to the input', () => {
    const { container } = render(<CodeStep cooldownRestartKey={0} isBusy={false} onResend={noop} onSubmit={noop} />);
    const input = screen.getByLabelText('Sign-in code');
    const label = container.querySelector('label');
    expect(label?.textContent).toBe('Sign-in code');
    expect(label?.getAttribute('for')).toBe(input.id);
  });
});
