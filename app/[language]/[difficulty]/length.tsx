// Length step route: how many questions to play from the whole bank or the `?topic=` pool. A pool
// too small for any fixed length goes straight to the round. A language or difficulty the
// manifest does not list shows the not-found screen.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { LengthStep } from '../../../components/menu/LengthStep';
import { buildPlayHref } from '../../../services/quiz/buildPlayHref';
import { isLengthChoiceOffered, readPoolSize } from '../../../services/quiz/roundLength';
import { useLanguageManifest } from '../../../state/useLanguageManifest';

export default function LengthScreen() {
  const {
    difficulty,
    language,
    topic: rawTopic,
  } = useLocalSearchParams<{ difficulty: string; language: string; topic?: string }>();
  const { languages } = useLanguageManifest();
  const languageEntry = languages.find(({ id }) => id === language);
  if (!languageEntry || !Object.hasOwn(languageEntry.banks, difficulty)) return <NotFoundScreen />;
  const topic = typeof rawTopic === 'string' ? rawTopic : undefined;
  const bank = (languageEntry.banks as Record<string, { topicCounts?: Record<string, number> }>)[difficulty];
  const poolSize = readPoolSize(bank.topicCounts ?? {}, topic);
  if (!isLengthChoiceOffered(poolSize)) return <Redirect href={buildPlayHref({ difficulty, language, topic })} />;
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <LengthStep
          difficulty={difficulty}
          language={language}
          onBack={() => router.replace(`/${language}/${difficulty}`)}
          onSelectLength={(count) => router.push(buildPlayHref({ count, difficulty, language, topic }))}
          poolSize={poolSize}
        />
      </View>
    </ScrollView>
  );
}
