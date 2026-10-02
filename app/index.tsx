// Language step route: the app title, the languages the manifest lists,
// and lifetime stats.
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { LanguageStep } from '../components/menu/LanguageStep';
import { StatsPanel } from '../components/stats/StatsPanel';
import { useLanguageManifest } from '../state/useLanguageManifest';

export default function LanguageScreen() {
  const { languages } = useLanguageManifest();
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <View className="mb-10 items-center">
          <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
            syntactical<Text className="text-signal">_</Text>
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            High-velocity drills for developers who think they already know the answer.
          </Text>
        </View>
        <LanguageStep languages={languages} onSelectLanguage={(language) => router.push(`/${language}`)} />
        <StatsPanel />
      </View>
    </ScrollView>
  );
}
