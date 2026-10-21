// Step 3 route for one bank: a round length for the whole bank (20, 50, or every question) or one
// topic of it, which goes on to the length step when its pool offers a fixed length. A language or
// difficulty the manifest does not list shows the not-found screen.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { TopicStep } from '../../../components/menu/TopicStep';
import { findBankInLanguage } from '../../../services/content/findBankInLanguage';
import { findLanguageEntry } from '../../../services/content/findLanguageEntry';
import { buildPlayHref } from '../../../services/quiz/buildPlayHref';
import { isLengthChoiceOffered, readPoolSize, reconcilePoolSize } from '../../../services/quiz/roundLength';
import { useLanguageManifest } from '../../../state/useLanguageManifest';
import { useQuestionBank } from '../../../state/useQuestionBank';

export default function TopicScreen() {
  const { difficulty, language } = useLocalSearchParams<{ difficulty: string; language: string }>();
  const { languages } = useLanguageManifest();
  const bankState = useQuestionBank(language, difficulty);
  const questions = bankState.status === 'ready' ? bankState.bank.questions : undefined;
  const languageEntry = findLanguageEntry(languages, language);
  const bank = languageEntry && findBankInLanguage(languageEntry, difficulty);
  if (!bank) return <NotFoundScreen />;
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <TopicStep
          difficulty={difficulty}
          language={language}
          bankQuestions={questions}
          onBack={() => router.replace(`/${language}`)}
          onSelectLength={(count) => router.push(buildPlayHref({ count, difficulty, language }))}
          onSelectTopic={(topic) => {
            const poolSize = reconcilePoolSize(readPoolSize(bank.topicCounts, topic), questions, topic);
            const screen = isLengthChoiceOffered(poolSize) ? 'length' : 'play';
            router.push(buildPlayHref({ difficulty, language, screen, topic }));
          }}
        />
      </View>
    </ScrollView>
  );
}
