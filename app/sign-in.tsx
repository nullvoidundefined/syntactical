// Sign-in route: an email step, then a code step. Errors are announced in a
// role="alert" region by reason only; the email and the code are never
// echoed or logged.
import { useRef, useState } from 'react';

import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { CodeStep } from '../components/auth/CodeStep';
import { EmailStep } from '../components/auth/EmailStep';
import { useAuth, type AuthResult } from '../state/AuthProvider';

const RETURN_TO_MAX_LENGTH = 200;
// One leading slash, never followed by another slash or a backslash, then URL-safe characters only.
const RETURN_TO_PATTERN = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%?-][A-Za-z0-9._~!$&'()*+,;=:@%?/-]*)?$/;

// Where a successful sign-in goes: the returnTo param when it is a safe in-app
// path, else the menu. The param comes from the URL, so anything else is ignored.
function readReturnTo(value: string | string[] | undefined): string {
    const isSafe =
        typeof value === 'string' &&
        value.length <= RETURN_TO_MAX_LENGTH &&
        RETURN_TO_PATTERN.test(value);
    return isSafe ? value : '/';
}

type FailureReason = Extract<AuthResult, { isOk: false }>['reason'];

const ERROR_MESSAGES: Record<FailureReason, string> = {
    'invalid-code': 'That code did not work. Check the newest email and try again.',
    'invalid-email': 'That email address does not look right. Check it and try again.',
    'rate-limited': 'Too many attempts. Wait a few minutes, then try again.',
    unavailable: 'Sign-in is unavailable right now. Try again later.',
};

// The announcement for a failed result; null for a success.
function readFailureMessage(result: AuthResult): string | null {
    return 'reason' in result ? ERROR_MESSAGES[result.reason] : null;
}

export default function SignInScreen() {
    const { requestCode, verifyCode } = useAuth();
    const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
    const [email, setEmail] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [cooldownRestartKey, setCooldownRestartKey] = useState(0);
    const isInFlightRef = useRef(false);

    async function sendCode(address: string, isResend: boolean) {
        if (isInFlightRef.current) return;
        isInFlightRef.current = true;
        setIsBusy(true);
        setErrorMessage(null);
        try {
            const result = await requestCode(address);
            if (isResend) setCooldownRestartKey((key) => key + 1);
            const failureMessage = readFailureMessage(result);
            if (failureMessage !== null) {
                setErrorMessage(failureMessage);
                return;
            }
            setEmail(address);
        } finally {
            isInFlightRef.current = false;
            setIsBusy(false);
        }
    }

    async function verify(code: string) {
        if (email === null || isInFlightRef.current) return;
        isInFlightRef.current = true;
        setIsBusy(true);
        setErrorMessage(null);
        try {
            const result = await verifyCode(email, code);
            const failureMessage = readFailureMessage(result);
            if (failureMessage !== null) {
                setErrorMessage(failureMessage);
                return;
            }
            router.replace(readReturnTo(returnTo) as Href);
        } finally {
            isInFlightRef.current = false;
            setIsBusy(false);
        }
    }

    return (
        <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
            <View className="w-full max-w-xl">
                <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
                    Sign in
                </Text>
                {errorMessage === null ? null : (
                    <View accessible role="alert" className="mt-4">
                        <Text className="font-mono text-sm text-ink">{errorMessage}</Text>
                    </View>
                )}
                {email === null ? (
                    <EmailStep
                        isBusy={isBusy}
                        onSubmit={(address) => void sendCode(address, false)}
                    />
                ) : (
                    <CodeStep
                        cooldownRestartKey={cooldownRestartKey}
                        isBusy={isBusy}
                        onResend={() => void sendCode(email, true)}
                        onSubmit={(code) => void verify(code)}
                    />
                )}
            </View>
        </ScrollView>
    );
}
