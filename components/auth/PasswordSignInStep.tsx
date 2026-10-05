// First sign-in step: email, password, and "Sign in", with the code flow, the
// forgot-password flow, and sign-up one control away. Both values are held by
// the screen; no length rule applies here and nothing is trimmed, since only
// the server judges a sign-in.
import { Platform } from 'react-native';

import { buildAuthHref } from '../../services/auth/readReturnTo';
import { AuthButton } from './AuthButton';
import { EmailField } from './EmailField';
import { AuthForm } from './AuthForm';
import { AuthLink } from './AuthLink';
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
  returnTo?: string | string[];
};

const IS_WEB = Platform.OS === 'web';

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
  returnTo,
}: PasswordSignInStepProps) {
  const signUpHref = buildAuthHref('/sign-up', returnTo);
  function submit() {
    if (!isBusy) onSubmit();
  }
  // On web Enter submits the form (the single submit path); react-native-web would cancel
  // that implicit submission if onSubmitEditing were set.
  const onSubmitEditing = IS_WEB ? undefined : submit;
  return (
    <AuthForm onSubmit={submit}>
      <EmailField value={email} onChangeText={onChangeEmail} returnKeyType="go" onSubmitEditing={onSubmitEditing} />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={password}
        onChangeText={onChangePassword}
        errorId={errorId}
        onSubmitEditing={onSubmitEditing}
      />
      <AuthButton label="Sign in" isDisabled={isBusy} isSubmit onPress={submit} />
      <AuthButton label="Use a code instead" isPrimary={false} onPress={onUseCode} />
      <AuthButton label="Forgot password?" isPrimary={false} onPress={onForgotPassword} />
      <AuthLink href={signUpHref} label="Create an account" />
    </AuthForm>
  );
}
