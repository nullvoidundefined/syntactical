// Topic step route for one bank: the whole bank or one topic of it. A language or difficulty the
// manifest does not list shows the not-found screen.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { TopicStep } from '../../../components/menu/TopicStep';
import { useLanguageManifest } from '../../../state/useLanguageManifest';

export default function TopicScreen() {
  const { difficulty, language } = useLocalSearchParams<{ difficulty: string; language: string }>();
  const { languages } = useLanguageManifest();
  const languageEntry = languages.find(({ id }) => id === language);
  if (!languageEntry || !Object.hasOwn(languageEntry.banks, difficulty)) return <NotFoundScreen />;
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <TopicStep
          difficulty={difficulty}
          language={language}
          onBack={() => router.replace(`/${language}`)}
          onSelectTopic={(topic) =>
            router.push(
              topic === undefined
                ? `/${language}/${difficulty}/play`
                : `/${language}/${difficulty}/play?topic=${encodeURIComponent(topic)}`,
            )
          }
        />
      </View>
    </ScrollView>
  );
}
