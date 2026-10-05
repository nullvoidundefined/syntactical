// The Settings password form: "Add a password" (one new-password field) for an account without
// one, "Change password" (current and new) for one with a password. Saving sends PUT me/password
// with currentPassword only when that field is filled. A 403 AUTH_REAUTH_REQUIRED, or "Use a
// code instead", swaps the form for the code steps of the signed-in email; after the code sign-in
// the form returns with the new password still entered. Both passwords live in this component's
// memory only: they are sent in the request, cleared on a save, and gone when Settings is left.
// Refusals are announced in one role="alert" region by reason only, tied to the field they
// concern; no password or email is echoed.
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { NavigationContext } from 'expo-router/build/react-navigation/core';
import { Platform, Text, View } from 'react-native';

import { apiPut } from '../../clients/apiClient';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_OK,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  PASSWORD_MAX_LENGTH,
} from '../../constants/appConfig';
import { countPasswordLength } from '../../services/auth/countPasswordLength';
import {
  PASSWORD_BREACHED_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SERVER_BUSY_MESSAGE,
} from '../../services/auth/passwordFailureMessages';

import { AuthButton } from './AuthButton';
import { AuthForm } from './AuthForm';
import { InlineCodeSignIn } from './InlineCodeSignIn';
import { PasswordField } from './PasswordField';

type PasswordSettingsFormProps = {
  email: string;
  hasPassword: boolean;
  onPasswordSaved?: (hasPassword: boolean) => void;
  shouldFocusFirstField?: boolean;
};

type Refusal = { field: 'current' | 'new' | null; message: string };

const ERROR_ID = 'password-settings-error';
const SAVED_MESSAGE = 'Password saved. Other devices were signed out.';
const WRONG_CURRENT_MESSAGE = 'That current password is not right.';
const INVALID_PASSWORD_MESSAGE = 'That password cannot be used. Check it and try again.';
const UNAVAILABLE_MESSAGE = 'Saving a password is unavailable right now. Try again later.';
const IS_WEB = Platform.OS === 'web';
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const POLICY_REFUSALS: Record<string, string> = {
  AUTH_PASSWORD_BREACHED: PASSWORD_BREACHED_MESSAGE,
  AUTH_PASSWORD_TOO_LONG: PASSWORD_TOO_LONG_MESSAGE,
  AUTH_PASSWORD_TOO_SHORT: PASSWORD_TOO_SHORT_MESSAGE,
};

function readErrorCode(body: unknown): string | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}

function readHasPassword(body: unknown): boolean {
  return (body as { data?: { hasPassword?: unknown } } | null)?.data?.hasPassword === true;
}

// The field a body the server called invalid belongs to: the current password when it is
// malformed or over the length limit, otherwise the new one.
function readInvalidBodyField(currentPassword: string): 'current' | 'new' {
  const isCurrentInvalid =
    currentPassword !== '' &&
    (LONE_SURROGATE.test(currentPassword) || countPasswordLength(currentPassword) > PASSWORD_MAX_LENGTH);
  return isCurrentInvalid ? 'current' : 'new';
}

function readRefusal(status: number, body: unknown, currentPassword: string): Refusal {
  if (status === HTTP_STATUS_TOO_MANY_REQUESTS) return { field: null, message: RATE_LIMITED_MESSAGE };
  const code = readErrorCode(body);
  if (status === HTTP_STATUS_SERVICE_UNAVAILABLE && code === 'SERVER_BUSY') {
    return { field: null, message: SERVER_BUSY_MESSAGE };
  }
  if (status === HTTP_STATUS_BAD_REQUEST && code !== null) {
    if (code === 'AUTH_INVALID_CREDENTIALS') return { field: 'current', message: WRONG_CURRENT_MESSAGE };
    if (code in POLICY_REFUSALS) return { field: 'new', message: POLICY_REFUSALS[code] };
    if (code === 'INPUT_INVALID_BODY') {
      return { field: readInvalidBodyField(currentPassword), message: INVALID_PASSWORD_MESSAGE };
    }
  }
  return { field: null, message: UNAVAILABLE_MESSAGE };
}

// Runs onBlur when the screen loses focus, e.g. when another route is pushed over it in a
// stack. Outside a navigator there is no focus to lose, so nothing is subscribed.
function useClearOnBlur(onBlur: () => void) {
  const navigation = useContext(NavigationContext);
  useEffect(() => navigation?.addListener('blur', onBlur), [navigation, onBlur]);
}

export function PasswordSettingsForm({
  email,
  hasPassword,
  onPasswordSaved,
  shouldFocusFirstField = false,
}: PasswordSettingsFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCodeStep, setIsCodeStep] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isInFlightRef = useRef(false);
  const rootRef = useRef<View>(null);

  // Leaving clears both passwords and the code steps. The setters are stable, so the blur
  // listener subscribes once.
  const resetOnBlur = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setIsCodeStep(false);
    setRefusal(null);
    setIsSaved(false);
  }, []);
  useClearOnBlur(resetOnBlur);

  useEffect(() => {
    if (!shouldFocusFirstField || !IS_WEB) return;
    const root = rootRef.current as unknown as HTMLElement | null;
    root?.querySelector<HTMLElement>('input')?.focus();
  }, [shouldFocusFirstField]);

  async function save() {
    if (isInFlightRef.current) return;
    isInFlightRef.current = true;
    setIsBusy(true);
    setRefusal(null);
    setIsSaved(false);
    try {
      if (countPasswordLength(newPassword) > PASSWORD_MAX_LENGTH) {
        setRefusal({ field: 'new', message: PASSWORD_TOO_LONG_MESSAGE });
        return;
      }
      const body = currentPassword === '' ? { newPassword } : { currentPassword, newPassword };
      const { body: replyBody, status } = await apiPut('me/password', body);
      if (status === HTTP_STATUS_OK) {
        setCurrentPassword('');
        setNewPassword('');
        setIsSaved(true);
        onPasswordSaved?.(readHasPassword(replyBody));
      } else if (status === HTTP_STATUS_FORBIDDEN && readErrorCode(replyBody) === 'AUTH_REAUTH_REQUIRED') {
        setIsCodeStep(true);
      } else {
        setRefusal(readRefusal(status, replyBody, currentPassword));
      }
    } catch {
      setRefusal({ field: null, message: UNAVAILABLE_MESSAGE });
    } finally {
      isInFlightRef.current = false;
      setIsBusy(false);
    }
  }

  function submit() {
    if (!isBusy) void save();
  }
  // On web Enter submits the form (the single submit path); react-native-web would cancel
  // that implicit submission if onSubmitEditing were set.
  const onSubmitEditing = IS_WEB ? undefined : submit;
  const errorIdFor = (field: 'current' | 'new') => (refusal?.field === field ? ERROR_ID : undefined);

  return (
    <View ref={rootRef} className="mt-6">
      <Text role="heading" aria-level={3} className="font-mono text-sm uppercase tracking-widest text-ink">
        {hasPassword ? 'Change password' : 'Add a password'}
      </Text>
      {refusal === null ? null : (
        <View accessible role="alert" nativeID={ERROR_ID} className="mt-4">
          <Text className="font-mono text-sm text-ink">{refusal.message}</Text>
        </View>
      )}
      {isSaved ? (
        <View role="status" className="mt-4">
          <Text className="font-mono text-sm text-ink">{SAVED_MESSAGE}</Text>
        </View>
      ) : null}
      {isCodeStep ? (
        <InlineCodeSignIn email={email} onSignedIn={() => setIsCodeStep(false)} />
      ) : (
        <AuthForm onSubmit={submit}>
          {hasPassword ? (
            <PasswordField
              label="Current password"
              autoComplete="current-password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              errorId={errorIdFor('current')}
              onSubmitEditing={onSubmitEditing}
            />
          ) : null}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChangeText={setNewPassword}
            errorId={errorIdFor('new')}
            onSubmitEditing={onSubmitEditing}
          />
          <AuthButton label="Save password" isDisabled={isBusy} isSubmit onPress={submit} />
          <AuthButton label="Use a code instead" isPrimary={false} onPress={() => setIsCodeStep(true)} />
        </AuthForm>
      )}
    </View>
  );
}
