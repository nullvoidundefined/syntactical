// The code steps for the signed-in email, shown inside Settings when a password change needs a
// fresh sign-in: the code is sent as the steps open, there is no email field, and the code is
// verified through the AuthProvider code sign-in. "Back to password" hands control back to the
// caller. A refusal is announced in one role="alert" region by reason only; the email and the
// code are never echoed.
import { useEffect, useRef, useState } from 'react';

import { Text, View } from 'react-native';

import { RATE_LIMITED_MESSAGE } from '../../services/auth/passwordFailureMessages';
import { useAuth, type AuthResult } from '../../state/AuthProvider';

import { AuthButton } from './AuthButton';
import { CodeStep } from './CodeStep';

type FailureReason = Extract<AuthResult, { isOk: false }>['reason'];

const ERROR_ID = 'inline-code-error';
const CODE_REFUSED_MESSAGE = 'That code did not work. Check the newest email and try again.';

const ERROR_MESSAGES: Record<FailureReason, string> = {
  busy: 'Sign-in is busy. Try again in a moment.',
  'invalid-code': CODE_REFUSED_MESSAGE,
  'invalid-credentials': CODE_REFUSED_MESSAGE,
  'invalid-email': 'That email address does not look right. Check it and try again.',
  'rate-limited': RATE_LIMITED_MESSAGE,
  unavailable: 'Sign-in is unavailable right now. Try again later.',
};

type InlineCodeSignInProps = {
  email: string;
  onBack: () => void;
  onSignedIn: () => void;
};

export function InlineCodeSignIn({ email, onBack, onSignedIn }: InlineCodeSignInProps) {
  const { requestCode, verifyCode } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [cooldownRestartKey, setCooldownRestartKey] = useState(0);
  const isSentOnOpenRef = useRef(false);
  const isInFlightRef = useRef(false);

  async function runExclusive(work: () => Promise<AuthResult>): Promise<boolean> {
    if (isInFlightRef.current) return false;
    isInFlightRef.current = true;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const result = await work();
      if (!result.isOk) setErrorMessage(ERROR_MESSAGES[result.reason]);
      return result.isOk;
    } finally {
      isInFlightRef.current = false;
      setIsBusy(false);
    }
  }

  async function sendCode(isResend: boolean) {
    await runExclusive(() => requestCode(email));
    if (isResend) setCooldownRestartKey((key) => key + 1);
  }

  useEffect(() => {
    if (isSentOnOpenRef.current) return;
    isSentOnOpenRef.current = true;
    void sendCode(false);
    // The code goes out once, as the steps open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(code: string) {
    if (await runExclusive(() => verifyCode(email, code))) onSignedIn();
  }

  return (
    <View>
      {errorMessage === null ? null : (
        <View accessible role="alert" nativeID={ERROR_ID} className="mt-4">
          <Text className="font-mono text-sm text-ink">{errorMessage}</Text>
        </View>
      )}
      <CodeStep
        cooldownRestartKey={cooldownRestartKey}
        isBusy={isBusy}
        onResend={() => void sendCode(true)}
        onSubmit={(code) => void verify(code)}
      />
      <AuthButton label="Back to password" isPrimary={false} isDisabled={isBusy} onPress={onBack} />
    </View>
  );
}
