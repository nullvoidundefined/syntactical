// Sign-up route: an email and password step, then the emailed code step. Errors are announced
// in one role="alert" region by reason only; the email, the password, and the code are never
// echoed or logged. The password lives in this component's memory only: it is sent in the sign-up
// requests, cleared on success, and gone when the route is left.
import { useContext, useEffect, useRef, useState } from 'react';

import { router, useLocalSearchParams, type Href } from 'expo-router';
import { NavigationContext } from 'expo-router/build/react-navigation/core';
import { ScrollView, Text, View } from 'react-native';

import { AuthButton } from '../components/auth/AuthButton';
import { AuthLink } from '../components/auth/AuthLink';
import { CodeStep } from '../components/auth/CodeStep';
import { SignUpStep } from '../components/auth/SignUpStep';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/appConfig';
import { countPasswordLength } from '../services/auth/countPasswordLength';
import { buildAuthHref, readReturnTo } from '../services/auth/readReturnTo';
import { useAuth, type StartSignUpResult } from '../state/AuthProvider';

type FailureReason = Extract<StartSignUpResult, { isOk: false }>['reason'];

const ERROR_ID = 'sign-up-error';
const ALREADY_HAD_ACCOUNT =
  'You already had an account, so we signed you in. Your password was not changed; you can set one in Settings.';

const ERROR_MESSAGES: Record<FailureReason, string> = {
  busy: 'The server is busy. Try again in a moment.',
  'invalid-code': 'That code did not work. Check the newest email and try again.',
  'invalid-email': 'That email address does not look right. Check it and try again.',
  'password-breached': 'That password appeared in a data breach. Choose another password.',
  'password-too-long': `That password is too long. Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  'password-too-short': `That password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  'rate-limited': 'Too many attempts. Wait a few minutes, then try again.',
  unavailable: 'Sign-up is unavailable right now. Try again later.',
};

function isPasswordFailure(reason: FailureReason): boolean {
  return reason.startsWith('password-');
}

// Runs onBlur when the screen loses focus, e.g. when another route is pushed over it in a
// stack. Outside a navigator there is no focus to lose, so nothing is subscribed.
function useClearOnBlur(onBlur: () => void) {
  const navigation = useContext(NavigationContext);
  useEffect(() => navigation?.addListener('blur', onBlur), [navigation, onBlur]);
}

export default function SignUpScreen() {
  const { completeSignUp, startSignUp } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const [typedEmail, setTypedEmail] = useState('');
  const [typedPassword, setTypedPassword] = useState('');
  const [isCodeStep, setIsCodeStep] = useState(false);
  const [isAccountExisting, setIsAccountExisting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [cooldownRestartKey, setCooldownRestartKey] = useState(0);
  const isInFlightRef = useRef(false);

  async function runExclusive(work: () => Promise<void>) {
    if (isInFlightRef.current) return;
    isInFlightRef.current = true;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await work();
    } finally {
      isInFlightRef.current = false;
      setIsBusy(false);
    }
  }

  function readLengthFailure(): FailureReason | null {
    const length = countPasswordLength(typedPassword);
    if (length < PASSWORD_MIN_LENGTH) return 'password-too-short';
    if (length > PASSWORD_MAX_LENGTH) return 'password-too-long';
    return null;
  }

  useClearOnBlur(() => setTypedPassword(''));

  async function sendCode(isResend: boolean) {
    await runExclusive(async () => {
      const lengthFailure = readLengthFailure();
      if (lengthFailure !== null) {
        setErrorMessage(ERROR_MESSAGES[lengthFailure]);
        return;
      }
      const result = await startSignUp(typedEmail, typedPassword);
      if (isResend) setCooldownRestartKey((key) => key + 1);
      if (!result.isOk) {
        setErrorMessage(ERROR_MESSAGES[result.reason]);
        // A refused password is fixed on the password step, so a resend returns to it.
        if (isPasswordFailure(result.reason)) setIsCodeStep(false);
        return;
      }
      setIsCodeStep(true);
    });
  }

  async function verify(code: string) {
    await runExclusive(async () => {
      const result = await completeSignUp(typedEmail, code, typedPassword);
      if (!result.isOk) {
        setErrorMessage(ERROR_MESSAGES[result.reason]);
        // A refused password is fixed on the password step, so the user goes back to it.
        if (isPasswordFailure(result.reason)) setIsCodeStep(false);
        return;
      }
      setTypedPassword('');
      if (result.isPasswordApplied) {
        router.replace(readReturnTo(returnTo) as Href);
        return;
      }
      setIsAccountExisting(true);
    });
  }

  return (
    <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
      <View className="w-full max-w-xl">
        <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
          Create an account
        </Text>
        {errorMessage === null ? null : (
          <View accessible role="alert" nativeID={ERROR_ID} className="mt-4">
            <Text className="font-mono text-sm text-ink">{errorMessage}</Text>
          </View>
        )}
        {isAccountExisting ? (
          <View role="status" className="mt-4">
            <Text className="font-mono text-sm text-ink">{ALREADY_HAD_ACCOUNT}</Text>
            <AuthButton label="Continue" onPress={() => router.replace(readReturnTo(returnTo) as Href)} />
          </View>
        ) : isCodeStep ? (
          <CodeStep
            cooldownRestartKey={cooldownRestartKey}
            isBusy={isBusy}
            onResend={() => void sendCode(true)}
            onSubmit={(code) => void verify(code)}
          />
        ) : (
          <SignUpStep
            email={typedEmail}
            errorId={errorMessage === null ? undefined : ERROR_ID}
            isBusy={isBusy}
            password={typedPassword}
            onChangeEmail={setTypedEmail}
            onChangePassword={setTypedPassword}
            onSubmit={() => void sendCode(false)}
          />
        )}
        {isAccountExisting ? null : <AuthLink href={buildAuthHref('/sign-in', returnTo)} label="Sign in" />}
      </View>
    </ScrollView>
  );
}
