// The form wrapper the credential steps share. On web it is a real <form method="post"> so
// browsers offer to save the password; it has no action and every submit is cancelled, so the
// browser never navigates or puts a password in a URL. Native keeps a View.
import { createElement, type FormEvent, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

type AuthFormProps = {
  children: ReactNode;
  onSubmit: () => void;
};

export function AuthForm({ children, onSubmit }: AuthFormProps) {
  if (Platform.OS !== 'web') return <View>{children}</View>;
  return createElement(
    'form',
    {
      method: 'post',
      onSubmit: (event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      },
    },
    children,
  );
}
