// First sign-in step: one labeled email field; Enter or the button sends the code.
import { useState } from 'react';

import { Text, TextInput, View } from 'react-native';

import { AuthButton } from './AuthButton';

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
      <TextInput
        aria-label="Email address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
        returnKeyType="send"
        className="mt-4 border border-ink px-3 py-2 font-mono text-base text-ink"
      />
      <AuthButton label="Send code" isDisabled={isBusy} onPress={submit} />
    </View>
  );
}
