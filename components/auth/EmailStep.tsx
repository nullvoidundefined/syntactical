// First sign-in step: one labeled email field; Enter or the button sends the code.
import { useState } from 'react';

import { Text, View } from 'react-native';

import { AuthButton } from './AuthButton';
import { EmailField } from './EmailField';

type EmailStepProps = {
  initialEmail?: string;
  isBusy: boolean;
  onSubmit: (email: string) => void;
};

export function EmailStep({ initialEmail = '', isBusy, onSubmit }: EmailStepProps) {
  const [email, setEmail] = useState(initialEmail);
  function submit() {
    if (!isBusy) onSubmit(email.trim());
  }
  return (
    <View>
      <Text className="mt-2 text-sm text-muted">Enter your email and we will send you a one-time code.</Text>
      <EmailField value={email} onChangeText={setEmail} returnKeyType="send" onSubmitEditing={submit} />
      <AuthButton label="Send code" isDisabled={isBusy} onPress={submit} />
    </View>
  );
}
