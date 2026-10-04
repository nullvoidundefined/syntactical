// Settings route: the daily goal (10, 20, or 50 XP, in force from today on)
// and the account: sign in for a guest, sign out and delete account for a signed-in user. A
// guest's goal is stored on the device; a signed-in user's goal is sent with
// PATCH /v1/me and stored on the device once the server accepts it, and a
// refused or failed change is announced and leaves the goal unchanged. When
// account deletion is refused with 401 the "session ended" notice stays in the
// account section after the sign-out, until the user signs in again.
import { useEffect, useState } from 'react';

import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DeleteAccountDialog } from '../components/auth/DeleteAccountDialog';
import { SignOutDialog } from '../components/auth/SignOutDialog';
import { DailyGoalPicker } from '../components/progress/DailyGoalPicker';
import { useAuth } from '../state/AuthProvider';
import { useQuizStats } from '../state/StatsProvider';
import { useProfile } from '../state/useProfile';
import { useProgressSummary } from '../state/useProgressSummary';

const GOAL_SAVE_FAILED = 'Your daily goal was not saved. Check your connection and try again.';

const SESSION_ENDED = 'Your session has ended. Sign in again to delete your account.';

function AccountSection() {
  const { isSignedIn } = useAuth();
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  // Signing in again (or leaving the screen) clears the notice.
  useEffect(() => {
    if (isSignedIn) return undefined;
    return () => setIsSessionEnded(false);
  }, [isSignedIn]);
  return (
    <View className="mt-10 border-t border-line pt-6">
      <Text role="heading" aria-level={2} className="font-mono text-sm uppercase tracking-widest text-ink">
        Account
      </Text>
      <View className="mt-4 flex-row items-center justify-between">
        <Text className="text-sm text-muted">{isSignedIn ? 'Signed in. Your progress syncs across devices.' : 'Sign in to save your progress.'}</Text>
        {isSignedIn ? (
          <View className="items-end gap-4">
            <SignOutDialog />
            <DeleteAccountDialog onSessionEnded={() => setIsSessionEnded(true)} />
          </View>
        ) : (
          <Pressable role="link" aria-label="Sign in" onPress={() => router.push('/sign-in')}>
            <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign in</Text>
          </Pressable>
        )}
      </View>
      {isSessionEnded ? (
        <Text role="alert" className="mt-3 text-sm text-ink">
          {SESSION_ENDED}
        </Text>
      ) : null}
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
          <Text role="heading" aria-level={2} nativeID="daily-goal-heading" className="font-mono text-sm uppercase tracking-widest text-ink">
            Daily goal
          </Text>
          <Text className="mt-2 text-sm text-muted">XP to earn each day. A new goal applies from today on.</Text>
          <DailyGoalPicker isBusy={isBusy} labelledBy="daily-goal-heading" onSelect={(next) => void chooseGoal(next)} selectedGoal={dailyGoal} />
          {errorMessage === null ? null : (
            <Text role="alert" className="mt-3 text-sm text-ink">
              {errorMessage}
            </Text>
          )}
        </View>
        <AccountSection />
      </View>
    </ScrollView>
  );
}
