// Difficulty step route for one language; a language the manifest does not list shows the
// not-found screen. Every bank is free: selecting a difficulty opens its topic step.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../+not-found';
import { DifficultyStep } from '../../components/menu/DifficultyStep';
import { findLanguageEntry } from '../../services/content/findLanguageEntry';
import { listLanguageParams, type LanguageParams } from '../../services/content/listStaticRouteParams';
import { useLanguageManifest } from '../../state/useLanguageManifest';

// One static page per track in the bundled manifest; a track added later is still served by the not-found page,
// whose client router renders this route.
export function generateStaticParams(): LanguageParams[] {
  return listLanguageParams();
}

export default function DifficultyScreen() {
  const { language } = useLocalSearchParams<{ language: string }>();
  const { languages } = useLanguageManifest();
  if (!findLanguageEntry(languages, language)) return <NotFoundScreen />;
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <DifficultyStep
          language={language}
          onSelectDifficulty={(difficulty) => router.push(`/${language}/${difficulty}`)}
          onBack={() => router.replace('/')}
        />
      </View>
    </ScrollView>
  );
}
