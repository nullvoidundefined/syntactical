// Length step route: how many questions to play from the whole bank or the `?topic=` pool. A pool
// too small for any fixed length goes straight to the round. A language or difficulty the
// manifest does not list shows the not-found screen.
// Until ContentProvider has read the on-device cache it shows the loading state, whatever the query.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { LengthStep } from '../../../components/menu/LengthStep';
import { findBankInLanguage } from '../../../services/content/findBankInLanguage';
import { findLanguageEntry } from '../../../services/content/findLanguageEntry';
import { listBankParams, type BankParams } from '../../../services/content/listStaticRouteParams';
import { buildPlayHref } from '../../../services/quiz/buildPlayHref';
import { isLengthChoiceOffered, readPoolSize, reconcilePoolSize } from '../../../services/quiz/roundLength';
import { useContentContext } from '../../../state/ContentProvider';
import { useLanguageManifest } from '../../../state/useLanguageManifest';
import { useQuestionBank } from '../../../state/useQuestionBank';

// One static page per track and difficulty pair in the bundled manifest.
export function generateStaticParams(): BankParams[] {
  return listBankParams();
}

export default function LengthScreen() {
  const {
    difficulty,
    language,
    topic: rawTopic,
  } = useLocalSearchParams<{ difficulty: string; language: string; topic?: string }>();
  const { languages } = useLanguageManifest();
  const bankState = useQuestionBank(language, difficulty);
  const { isHydrated: isContentHydrated } = useContentContext();
  // The static export renders this page without its query. Until the cache is read nothing resolves from ?topic, so
  // the first client render matches the build-time HTML.
  if (!isContentHydrated) return <ActivityIndicator className="flex-1" />;
  const languageEntry = findLanguageEntry(languages, language);
  const bank = languageEntry && findBankInLanguage(languageEntry, difficulty);
  if (!bank) return <NotFoundScreen />;
  const topic = typeof rawTopic === 'string' ? rawTopic : undefined;
  const questions = bankState.status === 'ready' ? bankState.bank.questions : undefined;
  const poolSize = reconcilePoolSize(readPoolSize(bank.topicCounts, topic), questions, topic);
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
