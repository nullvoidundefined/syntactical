// Difficulty step route for one language; a language the manifest does not
// list shows the not-found screen.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../+not-found';
import { DifficultyStep } from '../../components/menu/DifficultyStep';
import { useLanguageManifest } from '../../state/useLanguageManifest';

export default function DifficultyScreen() {
  const { language } = useLocalSearchParams<{ language: string }>();
  const { languages } = useLanguageManifest();
  if (!languages.some(({ id }) => id === language)) return <NotFoundScreen />;
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
