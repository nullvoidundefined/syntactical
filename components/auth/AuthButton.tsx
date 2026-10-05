// A text button for the sign-in steps: a real button role, announced as
// disabled and inert while disabled.
import { createElement } from 'react';
import { Platform, Pressable, Text } from 'react-native';

type AuthButtonProps = {
  isDisabled?: boolean;
  isPrimary?: boolean;
  label: string;
  // On web a submit button is a real <button type="submit">: a click submits its form,
  // so onPress is not used there. Native keeps the Pressable and calls onPress.
  isSubmit?: boolean;
  onPress?: () => void;
};

export function AuthButton({
  isDisabled = false,
  isPrimary = true,
  isSubmit = false,
  label,
  onPress,
}: AuthButtonProps) {
  const surface = isPrimary ? 'bg-ink' : 'border border-ink';
  const textColor = isPrimary ? 'text-surface' : 'text-ink';
  if (isSubmit && Platform.OS === 'web') {
    // react-native-web's Pressable cannot set type="submit", so the button is a DOM element.
    return createElement(
      'button',
      {
        type: 'submit',
        'aria-label': label,
        'aria-disabled': isDisabled,
        disabled: isDisabled,
        className: `mt-4 flex w-full cursor-pointer flex-col items-center border-0 px-4 py-3 ${surface} ${isDisabled ? 'opacity-60' : ''}`,
      },
      createElement('span', { className: `font-mono text-sm ${textColor}` }, label),
    );
  }
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
