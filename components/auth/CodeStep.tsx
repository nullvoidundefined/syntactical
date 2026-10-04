// Second sign-in step: one labeled code field and a resend button that stays
// disabled, with a visible countdown, for 60 seconds after each send.
import { useEffect, useRef, useState } from 'react';

import { Text, TextInput, View } from 'react-native';

import { AuthButton } from './AuthButton';

const RESEND_COOLDOWN_SECONDS = 60;
const MS_PER_SECOND = 1000;
const CODE_LENGTH = 6;
const INSTRUCTION_ID = 'sign-in-code-instruction';
const INSTRUCTION_TEXT = 'Enter the 6-digit code we emailed you.';

type CodeStepProps = {
  cooldownRestartKey: number;
  isBusy: boolean;
  onResend: () => void;
  onSubmit: (code: string) => void;
};

export function CodeStep({ cooldownRestartKey, isBusy, onResend, onSubmit }: CodeStepProps) {
  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  }, [cooldownRestartKey]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const isCoolingDown = secondsLeft > 0;
  function submit() {
    if (!isBusy) onSubmit(code.trim());
  }
  function resend() {
    if (!isCoolingDown && !isBusy) onResend();
  }
  return (
    <View>
      <Text nativeID={INSTRUCTION_ID} className="mt-2 text-sm text-muted">
        {INSTRUCTION_TEXT}
      </Text>
      <TextInput
        ref={inputRef}
        aria-describedby={INSTRUCTION_ID}
        accessibilityHint={INSTRUCTION_TEXT}
        aria-label="Sign-in code"
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={submit}
        returnKeyType="done"
        className="mt-4 border border-ink px-3 py-2 font-mono text-base text-ink"
      />
      <AuthButton label="Verify code" isDisabled={isBusy} onPress={submit} />
      <AuthButton label="Resend code" isPrimary={false} isDisabled={isCoolingDown || isBusy} onPress={resend} />
      {isCoolingDown ? (
        <Text className="mt-2 font-mono text-xs text-muted">
          {`You can request a new code in ${secondsLeft} ${secondsLeft === 1 ? 'second' : 'seconds'}.`}
        </Text>
      ) : null}
    </View>
  );
}
