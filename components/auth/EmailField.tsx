// A labeled email input. The label is visible text tied to the input (a real <label for> on
// web, aria-labelledby elsewhere) and the wrapper stretches the input to the column width,
// matching PasswordField. The value is held by the parent.
import { TextInput, View } from 'react-native';

import { FieldLabel } from './FieldLabel';

type EmailFieldProps = {
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  returnKeyType: 'go' | 'next' | 'send';
  value: string;
};

const INPUT_ID = 'email-address-input';

export function EmailField({ onChangeText, onSubmitEditing, returnKeyType, value }: EmailFieldProps) {
  return (
    <View className="mt-4 w-full">
      <FieldLabel inputId={INPUT_ID} text="Email address" />
      <TextInput
        nativeID={INPUT_ID}
        aria-label="Email address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="email"
        keyboardType="email-address"
        value={value}
        onChangeText={onChangeText}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        className="mt-1 w-full border border-ink px-3 py-2 font-mono text-base text-ink"
      />
    </View>
  );
}
