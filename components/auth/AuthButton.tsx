// A text button for the sign-in steps: a real button role, announced as
// disabled and inert while disabled.
import { Pressable, Text } from 'react-native';

type AuthButtonProps = {
  isDisabled?: boolean;
  isPrimary?: boolean;
  label: string;
  onPress: () => void;
};

export function AuthButton({ isDisabled = false, isPrimary = true, label, onPress }: AuthButtonProps) {
  const surface = isPrimary ? 'bg-ink' : 'border border-ink';
  const textColor = isPrimary ? 'text-surface' : 'text-ink';
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      onPress={onPress}
      className={`mt-4 items-center px-4 py-3 ${surface} ${isDisabled ? 'opacity-60' : ''}`}
    >
      <Text className={`font-mono text-sm ${textColor}`}>{label}</Text>
    </Pressable>
  );
}
