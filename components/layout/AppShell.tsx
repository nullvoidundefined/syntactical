// The persistent frame: brand mark, live streak readout, the download
// indicator, and the content slot every route renders into, inside the
// safe area.
import type { ReactNode } from 'react';

import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQuizStats } from '../../state/StatsProvider';

import { DownloadIndicator } from './DownloadIndicator';

export function AppShell({ children }: { children: ReactNode }) {
  const { stats } = useQuizStats();
  const { best, current } = stats.streak;
  return (
    <SafeAreaView className="flex-1 bg-obsidian">
      <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
        <Text className="font-mono text-xs tracking-widest text-ink">SYNTACTICAL</Text>
        <Text className="font-mono text-xs uppercase tracking-widest text-muted">
          streak <Text className="text-signal">{current}</Text> / best <Text className="text-ink">{best}</Text>
        </Text>
      </View>
      <DownloadIndicator />
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );
}
