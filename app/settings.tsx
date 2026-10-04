// Settings route: the daily goal (10, 20, or 50 XP, in force from today on)
// and the account: sign in for a guest, sign out for a signed-in user. A
// guest's goal is stored on the device; a signed-in user's goal is sent with
// PATCH /v1/me and stored on the device once the server accepts it, and a
// refused or failed change is announced and leaves the goal unchanged.
import { useState } from 'react';

import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DAILY_GOALS } from '@syntactical/progress';

import { SignOutDialog } from '../components/auth/SignOutDialog';
import { useAuth } from '../state/AuthProvider';
import { useQuizStats } from '../state/StatsProvider';
import { useProfile } from '../state/useProfile';
import { useProgressSummary } from '../state/useProgressSummary';

const GOAL_SAVE_FAILED = 'Your daily goal was not saved. Check your connection and try again.';

type GoalOptionProps = { goal: number; isBusy: boolean; isSelected: boolean; onSelect: (goal: number) => void };

function GoalOption({ goal, isBusy, isSelected, onSelect }: GoalOptionProps) {
  return (
    <Pressable
      role="radio"
      aria-checked={isSelected}
      aria-disabled={isBusy}
      aria-label={`${goal} XP a day`}
      disabled={isBusy}
      onPress={() => onSelect(goal)}
      className={`flex-1 items-center border px-4 py-3 ${isSelected ? 'border-signal bg-signal' : 'border-line'}`}
    >
      <Text className={`font-mono text-sm ${isSelected ? 'text-obsidian' : 'text-ink'}`}>{`${goal} XP`}</Text>
    </Pressable>
  );
}

function AccountSection() {
  const { isSignedIn } = useAuth();
  return (
    <View className="mt-10 border-t border-line pt-6">
      <Text role="heading" aria-level={2} className="font-mono text-sm uppercase tracking-widest text-ink">
        Account
      </Text>
      <View className="mt-4 flex-row items-center justify-between">
        <Text className="text-sm text-muted">{isSignedIn ? 'Signed in. Your progress syncs across devices.' : 'Sign in to save your progress.'}</Text>
        {isSignedIn ? (
          <SignOutDialog />
        ) : (
          <Pressable role="link" aria-label="Sign in" onPress={() => router.push('/sign-in')}>
            <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign in</Text>
          </Pressable>
        )}
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
          <Text role="heading" aria-level={2} nativeID="daily-goal-heading" className="font-mono text-sm uppercase tracking-widest text-ink">
            Daily goal
          </Text>
          <Text className="mt-2 text-sm text-muted">XP to earn each day. A new goal applies from today on.</Text>
          <View role="radiogroup" aria-labelledby="daily-goal-heading" className="mt-4 flex-row gap-2">
            {DAILY_GOALS.map((goal) => (
              <GoalOption key={goal} goal={goal} isBusy={isBusy} isSelected={goal === dailyGoal} onSelect={(next) => void chooseGoal(next)} />
            ))}
          </View>
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
