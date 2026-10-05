// Settings route: the daily goal (10, 20, or 50 XP, in force from today on)
// and the account: sign in for a guest, sign out and delete account for a signed-in user. A
// guest's goal is stored on the device; a signed-in user's goal is sent with
// PATCH /v1/me and stored on the device once the server accepts it, and a
// refused or failed change is announced and leaves the goal unchanged.
import { useState } from 'react';

import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { DeleteAccountDialog } from '../components/auth/DeleteAccountDialog';
import { PasswordSettingsForm } from '../components/auth/PasswordSettingsForm';
import { SignOutDialog } from '../components/auth/SignOutDialog';
import { DailyGoalPicker } from '../components/progress/DailyGoalPicker';
import { useAuth } from '../state/AuthProvider';
import { useQuizStats } from '../state/StatsProvider';
import { useProfile } from '../state/useProfile';
import { useProgressSummary } from '../state/useProgressSummary';
import { usePurchases } from '../state/usePurchases';

const GOAL_SAVE_FAILED = 'Your daily goal was not saved. Check your connection and try again.';

const RESTORE_DONE = 'Purchases restored.';
const RESTORE_FAILED = 'Restore failed. Check your connection and try again.';

// Native only: Web Billing purchases follow the signed-in account, so the web has nothing to restore.
function RestorePurchases() {
  const { restore } = usePurchases();
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function restorePurchases() {
    setIsBusy(true);
    setMessage(null);
    try {
      setMessage((await restore()) ? RESTORE_DONE : RESTORE_FAILED);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <View className="mt-4">
      <Pressable
        role="button"
        aria-label="Restore purchases"
        aria-disabled={isBusy}
        disabled={isBusy}
        onPress={() => void restorePurchases()}
      >
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">Restore purchases</Text>
      </Pressable>
      {message === null ? null : (
        <Text role="status" className="mt-2 text-sm text-ink">
          {message}
        </Text>
      )}
    </View>
  );
}

function AccountSection() {
  const { isSignedIn } = useAuth();
  const { snapshot } = useProfile();
  const { form } = useLocalSearchParams<{ form?: string | string[] }>();
  const profile = snapshot?.profile;
  return (
    <View className="mt-10 border-t border-line pt-6">
      <Text role="heading" aria-level={2} className="font-mono text-sm uppercase tracking-widest text-ink">
        Account
      </Text>
      <View className="mt-4 flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          {isSignedIn ? 'Signed in. Your progress syncs across devices.' : 'Sign in to save your progress.'}
        </Text>
        {isSignedIn ? (
          <View className="flex-row items-center gap-4">
            <SignOutDialog />
            <DeleteAccountDialog />
          </View>
        ) : (
          <Pressable role="link" aria-label="Sign in" onPress={() => router.push('/sign-in')}>
            <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign in</Text>
          </Pressable>
        )}
      </View>
      {isSignedIn && profile?.email !== undefined && profile.hasPassword !== undefined ? (
        <PasswordSettingsForm
          email={profile.email}
          hasPassword={profile.hasPassword}
          shouldFocusFirstField={form === 'password'}
        />
      ) : null}
      {isSignedIn && Platform.OS !== 'web' ? <RestorePurchases /> : null}
    </View>
  );
}

function LegalLinks() {
  return (
    <View className="mt-10 border-t border-line pt-6">
      <Text role="heading" aria-level={2} className="font-mono text-sm uppercase tracking-widest text-ink">
        Legal
      </Text>
      <View className="mt-4 flex-row items-center gap-6">
        <Pressable role="link" aria-label="Privacy policy" onPress={() => router.push('/privacy')}>
          <Text className="font-mono text-xs uppercase tracking-widest text-ink">Privacy policy</Text>
        </Pressable>
        <Pressable role="link" aria-label="Account deletion" onPress={() => router.push('/delete-account')}>
          <Text className="font-mono text-xs uppercase tracking-widest text-ink">Account deletion</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { isSignedIn } = useAuth();
  const { setDailyGoal } = useQuizStats();
  const { updateDailyGoal } = useProfile();
  const { dailyGoal } = useProgressSummary();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function chooseGoal(goal: number) {
    setErrorMessage(null);
    if (!isSignedIn) {
      setDailyGoal(goal);
      return;
    }
    setIsBusy(true);
    try {
      if (await updateDailyGoal(goal)) setDailyGoal(goal);
      else setErrorMessage(GOAL_SAVE_FAILED);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
      <View className="w-full max-w-xl">
        <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
          Settings
        </Text>
        <View className="mt-8">
          <Text
            role="heading"
            aria-level={2}
            nativeID="daily-goal-heading"
            className="font-mono text-sm uppercase tracking-widest text-ink"
          >
            Daily goal
          </Text>
          <Text className="mt-2 text-sm text-muted">XP to earn each day. A new goal applies from today on.</Text>
          <DailyGoalPicker
            isBusy={isBusy}
            labelledBy="daily-goal-heading"
            onSelect={(next) => void chooseGoal(next)}
            selectedGoal={dailyGoal}
          />
          {errorMessage === null ? null : (
            <Text role="alert" className="mt-3 text-sm text-ink">
              {errorMessage}
            </Text>
          )}
        </View>
        <AccountSection />
        <LegalLinks />
      </View>
    </ScrollView>
  );
}
