// Both credential steps render their web form through the one AuthForm (PR
// 107 review, refactor guard). AuthForm is replaced here by a marker, so a
// step that still builds its own <form> renders no marker and fails.
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { PasswordSignInStep } from '../PasswordSignInStep';
import { SignUpStep } from '../SignUpStep';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: () => undefined, replace: () => undefined },
}));

jest.mock('../AuthForm', () => ({
  AuthForm: ({ children }: { children: ReactNode; onSubmit: () => void }) => (
    <section data-testid="auth-form-marker">{children}</section>
  ),
}));

const noop = () => undefined;

describe('credential steps share AuthForm on the web', () => {
  it('PasswordSignInStep puts its email and password inputs inside AuthForm', () => {
    render(
      <PasswordSignInStep
        email=""
        isBusy={false}
        password=""
        onChangeEmail={noop}
        onChangePassword={noop}
        onForgotPassword={noop}
        onSubmit={noop}
        onUseCode={noop}
      />,
    );
    const marker = screen.getByTestId('auth-form-marker');
    expect(marker.contains(screen.getByRole('textbox', { name: 'Email address' }))).toBe(true);
    expect(marker.contains(screen.getByLabelText('Password', { selector: 'input' }))).toBe(true);
    expect(document.querySelectorAll('form')).toHaveLength(0);
  });

  it('SignUpStep puts its email and password inputs inside AuthForm', () => {
    render(
      <SignUpStep email="" isBusy={false} password="" onChangeEmail={noop} onChangePassword={noop} onSubmit={noop} />,
    );
    const marker = screen.getByTestId('auth-form-marker');
    expect(marker.contains(screen.getByRole('textbox', { name: 'Email address' }))).toBe(true);
    expect(marker.contains(screen.getByLabelText('Password', { selector: 'input' }))).toBe(true);
    expect(document.querySelectorAll('form')).toHaveLength(0);
  });
});
