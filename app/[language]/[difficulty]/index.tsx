// Topic step route for one bank: the whole bank or one topic of it. A language or difficulty the
// manifest does not list shows the not-found screen.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { TopicStep } from '../../../components/menu/TopicStep';
import { buildPlayHref } from '../../../services/quiz/buildPlayHref';
import { isLengthChoiceOffered, readPoolSize } from '../../../services/quiz/roundLength';
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
          onSelectTopic={(topic) => {
            const bank = (languageEntry.banks as Record<string, { topicCounts?: Record<string, number> }>)[difficulty];
            const poolSize = readPoolSize(bank.topicCounts ?? {}, topic);
            const screen = isLengthChoiceOffered(poolSize) ? 'length' : 'play';
            router.push(buildPlayHref({ difficulty, language, screen, topic }));
          }}
        />
      </View>
    </ScrollView>
  );
}
