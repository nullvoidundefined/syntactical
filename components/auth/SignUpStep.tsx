// First sign-up step: email, a new-password field with its hint, and "Create account".
// Both values are held by the screen and never trimmed. On web the fields sit in a real
// <form> (the sign-in pattern) so browsers offer to save the new password; the form has no
// action and every submit is cancelled so the password never reaches a URL.
import { Platform, Text } from 'react-native';

import { AuthButton } from './AuthButton';
import { EmailField } from './EmailField';
import { AuthForm } from './AuthForm';
import { PasswordField } from './PasswordField';

type SignUpStepProps = {
  email: string;
  errorId?: string;
  isBusy: boolean;
  onChangeEmail: (email: string) => void;
  onChangePassword: (password: string) => void;
  onSubmit: () => void;
  password: string;
};

const HINT_ID = 'sign-up-password-hint';
const HINT_TEXT = 'At least 12 characters. Spaces are fine.';
const IS_WEB = Platform.OS === 'web';

export function SignUpStep({
  email,
  errorId,
  isBusy,
  onChangeEmail,
  onChangePassword,
  onSubmit,
  password,
}: SignUpStepProps) {
  function submit() {
    if (!isBusy) onSubmit();
  }
  // On web Enter submits the form (the single submit path); react-native-web would cancel
  // that implicit submission if onSubmitEditing were set.
  const onSubmitEditing = IS_WEB ? undefined : submit;
  return (
    <AuthForm onSubmit={submit}>
      <EmailField value={email} onChangeText={onChangeEmail} returnKeyType="next" onSubmitEditing={onSubmitEditing} />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        value={password}
        onChangeText={onChangePassword}
        errorId={errorId === undefined ? HINT_ID : `${HINT_ID} ${errorId}`}
        onSubmitEditing={onSubmitEditing}
      />
      <Text nativeID={HINT_ID} className="mt-3 font-mono text-xs text-muted">
        {HINT_TEXT}
      </Text>
      <AuthButton label="Create account" isDisabled={isBusy} isSubmit onPress={submit} />
    </AuthForm>
  );
}
