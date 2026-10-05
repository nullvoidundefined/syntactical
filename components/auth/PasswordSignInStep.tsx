// First sign-in step: email, password, and "Sign in", with the code flow, the
// forgot-password flow, and sign-up one control away. Both values are held by
// the screen; no length rule applies here and nothing is trimmed, since only
// the server judges a sign-in.
import { router } from 'expo-router';
import { createElement, type FormEvent, type ReactNode } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { AuthButton } from './AuthButton';
import { PasswordField } from './PasswordField';

type PasswordSignInStepProps = {
  email: string;
  errorId?: string;
  isBusy: boolean;
  onChangeEmail: (email: string) => void;
  onChangePassword: (password: string) => void;
  onForgotPassword: () => void;
  onSubmit: () => void;
  onUseCode: () => void;
  password: string;
};

// On web an href makes the element a real <a>, so Enter activates it; react-native-web
// reads it, native ignores it, and the types do not declare it.
const WEB_LINK_PROPS = { href: '/sign-up' } as object;

// The press handler owns navigation, so the browser's own link navigation is cancelled.
// A modified or non-primary click (new tab or window) is left to the browser.
function openSignUp(event?: {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
  shiftKey?: boolean;
}) {
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey) return;
  if (typeof event?.button === 'number' && event.button !== 0) return;
  event?.preventDefault?.();
  router.push('/sign-up');
}

const IS_WEB = Platform.OS === 'web';

// On web the fields sit in a real <form> so Safari and Firefox offer to save the password;
// native keeps a View. The form has no action or method, and every submit is cancelled so
// the browser never navigates or puts the password in a URL.
function SignInForm({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
  if (!IS_WEB) return <View>{children}</View>;
  return createElement(
    'form',
    {
      onSubmit: (event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      },
    },
    children,
  );
}

export function PasswordSignInStep({
  email,
  errorId,
  isBusy,
  onChangeEmail,
  onChangePassword,
  onForgotPassword,
  onSubmit,
  onUseCode,
  password,
}: PasswordSignInStepProps) {
  function submit() {
    if (!isBusy) onSubmit();
  }
  return (
    <SignInForm onSubmit={submit}>
      <TextInput
        aria-label="Email address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="email"
        keyboardType="email-address"
        value={email}
        onChangeText={onChangeEmail}
        returnKeyType="go"
        onSubmitEditing={submit}
        className="mt-4 border border-ink px-3 py-2 font-mono text-base text-ink"
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={password}
        onChangeText={onChangePassword}
        errorId={errorId}
        onSubmitEditing={submit}
      />
      <AuthButton label="Sign in" isDisabled={isBusy} isSubmit onPress={submit} />
      <AuthButton label="Use a code instead" isPrimary={false} onPress={onUseCode} />
      <AuthButton label="Forgot password?" isPrimary={false} onPress={onForgotPassword} />
      <Pressable role="link" aria-label="Create an account" {...WEB_LINK_PROPS} onPress={openSignUp} className="mt-4">
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">Create an account</Text>
      </Pressable>
    </SignInForm>
  );
}
