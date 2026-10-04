// The persistent frame: brand mark, the reviews-due link, the day streak,
// XP today, and daily goal ring, the settings link, the account control its
// caller supplies, the download indicator, and the content slot every route
// renders into, inside the safe area. The answer streak lives in the stats panel.
import type { ReactNode } from 'react';

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProgressSummary } from '../../state/useProgressSummary';
import { DailyGoalRing } from '../progress/DailyGoalRing';

import { DownloadIndicator } from './DownloadIndicator';
import { ReviewDueLink } from './ReviewDueLink';

function ProgressReadout() {
  const { dailyGoal, dayStreak, xpToday } = useProgressSummary();
  return (
    <View className="flex-row items-center gap-2">
      <Text className="sr-only">{`Day streak ${dayStreak}, ${xpToday} of ${dailyGoal} XP today`}</Text>
      <Text aria-hidden className="font-mono text-xs uppercase tracking-widest text-muted">
        day <Text className="text-signal">{dayStreak}</Text> / <Text className="text-ink">{`${xpToday}/${dailyGoal}`}</Text> xp
      </Text>
      <DailyGoalRing dailyGoal={dailyGoal} xpToday={xpToday} />
    </View>
  );
}

export function AppShell({ accountControl = null, children }: { accountControl?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-obsidian">
      <View role="banner" className="flex-row flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <Text className="font-mono text-xs tracking-widest text-ink">SYNTACTICAL</Text>
        <ReviewDueLink />
        <ProgressReadout />
        <Pressable role="link" aria-label="Settings" onPress={() => router.push('/settings')}>
          <Text className="font-mono text-xs uppercase tracking-widest text-ink">Settings</Text>
        </Pressable>
        {accountControl}
      </View>
      <View role="main" className="flex-1">
        <DownloadIndicator />
        {children}
      </View>
    </SafeAreaView>
  );
}
