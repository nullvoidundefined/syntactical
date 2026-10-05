// AuthForm on the web (PR 107 review, refactor guard): the one form wrapper
// that the password sign-in step and the sign-up step both render. It is a
// real <form method="post"> with no action, so browsers offer to save the
// password and the password can never land in a URL; every submit has its
// default prevented and calls onSubmit once.
//
// Interface: components/auth/AuthForm.tsx exports
//   AuthForm({ children, onSubmit }: { children: ReactNode; onSubmit: () => void })
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TextInput } from 'react-native';

import { AuthForm } from '../AuthForm';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: () => undefined, replace: () => undefined },
}));

function getOnlyForm(): HTMLFormElement {
  const forms = document.querySelectorAll('form');
  expect(forms).toHaveLength(1);
  return forms[0];
}

function submitIsDefaultPrevented(form: HTMLFormElement): boolean {
  let isNotPrevented = true;
  act(() => {
    isNotPrevented = fireEvent.submit(form);
  });
  return !isNotPrevented;
}

describe('AuthForm on the web', () => {
  it('renders its children inside one <form> with method POST and no action', () => {
    render(
      <AuthForm onSubmit={jest.fn()}>
        <TextInput aria-label="Email address" />
      </AuthForm>,
    );
    const form = getOnlyForm();
    expect(form.contains(screen.getByRole('textbox', { name: 'Email address' }))).toBe(true);
    expect(form.hasAttribute('action')).toBe(false);
    expect(form.method).toBe('post');
  });

  it('calls onSubmit once per submit, with the default prevented', () => {
    const onSubmit = jest.fn();
    render(
      <AuthForm onSubmit={onSubmit}>
        <TextInput aria-label="Email address" />
      </AuthForm>,
    );
    expect(submitIsDefaultPrevented(getOnlyForm())).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submitIsDefaultPrevented(getOnlyForm())).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
