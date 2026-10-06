// A labeled password input with a show-password toggle. The label is visible
// and names the input; the toggle is a real button whose name and aria-pressed
// follow its state, and it never changes the typed value. On web, focus returns
// to the input after each toggle. The value is held by the parent and never
// stored or logged here.
import { useRef, useState } from 'react';

import { Platform, Pressable, Text, TextInput, View } from 'react-native';

type PasswordFieldProps = {
  autoComplete: 'current-password' | 'new-password';
  errorId?: string;
  label: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  value: string;
};

export function PasswordField({
  autoComplete,
  errorId,
  label,
  onChangeText,
  onSubmitEditing,
  value,
}: PasswordFieldProps) {
  const [isShown, setIsShown] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const toggleLabel = isShown ? 'Hide password' : 'Show password';
  function toggle() {
    setIsShown((shown) => !shown);
    if (Platform.OS === 'web') inputRef.current?.focus();
  }
  return (
    <View className="mt-5">
      <Text className="font-mono text-sm text-ink">{label}</Text>
      <TextInput
        ref={inputRef}
        aria-label={label}
        aria-describedby={errorId}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!isShown}
        textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="done"
        className="mt-1 border border-ink px-3 py-2 font-mono text-base text-ink"
      />
      <Pressable
        role="button"
        aria-label={toggleLabel}
        aria-pressed={isShown}
        onPress={toggle}
        className="mt-3 self-start py-1"
      >
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">{isShown ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}
