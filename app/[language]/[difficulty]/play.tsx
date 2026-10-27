// Round route: shows the loading state until ContentProvider has read the on-device cache (the static export renders
// it at build time with no query and possibly no params), then resolves the language and difficulty against the manifest
// and the difficulty registry, waits for stats hydration and a ready
// bank, and remounts the round under a new key on Retry so every piece
// of round state resets. `?topic=<id>` plays one topic of the bank; a topic
// the bank has no questions for falls back to the whole bank. `?count=20|50`
// plays a random sample of that many from the pool, when smaller than it.
import { useEffect, useState } from 'react';

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { QuizRound } from '../../../components/quiz/QuizRound';
import { recordBankUse } from '../../../services/content/bankStore';
import { findDifficulty } from '../../../services/content/findDifficulty';
import { findLanguageEntry } from '../../../services/content/findLanguageEntry';
import { listBankParams, type BankParams } from '../../../services/content/listStaticRouteParams';
import { readRoundCount } from '../../../services/quiz/roundLength';
import { useContentContext } from '../../../state/ContentProvider';
import { useQuizStats } from '../../../state/StatsProvider';
import { useCanAsk } from '../../../state/useCanAsk';
import { useLanguageManifest } from '../../../state/useLanguageManifest';
import { useQuestionBank } from '../../../state/useQuestionBank';

// One static page per track and difficulty pair in the bundled manifest; ?count and ?topic resolve after the cache read.
export function generateStaticParams(): BankParams[] {
  return listBankParams();
}

function DownloadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text className="font-mono text-sm text-danger">Download failed</Text>
      <Pressable role="button" aria-label="Retry download" onPress={onRetry}>
        <Text className="font-mono text-sm text-signal">Retry</Text>
      </Pressable>
    </View>
  );
}

export default function RoundScreen() {
  const { count, difficulty, language, topic } = useLocalSearchParams<{
    count?: string | string[];
    difficulty: string;
    language: string;
    topic?: string;
  }>();
  const [roundKey, setRoundKey] = useState(0);
  const { isHydrated: isContentHydrated } = useContentContext();
  const { isHydrated } = useQuizStats();
  const canAsk = useCanAsk();
  const { languages } = useLanguageManifest();
  const bankState = useQuestionBank(language, difficulty);
  const languageEntry = findLanguageEntry(languages, language);
  const difficultyEntry = findDifficulty(difficulty);

  const { status } = bankState;
  // Playing a cached Medium or Hard bank counts as a use, so the cache evicts it last.
  useEffect(() => {
    if (status === 'ready') void recordBankUse(language, difficulty);
  }, [difficulty, language, status]);
  // Nothing resolves from params until the cache is read: the build-time render and the first client render match,
  // and a deep-linked round never starts on a bundled bank the cache is about to replace.
  if (!isContentHydrated) return <ActivityIndicator className="flex-1" />;
  if (!languageEntry || !difficultyEntry || status === 'unknown') return <NotFoundScreen />;
  if ('retry' in bankState) {
    const { retry } = bankState;
    return <DownloadFailed onRetry={retry} />;
  }
  if (!isHydrated || !('bank' in bankState)) return <ActivityIndicator className="flex-1" />;
  const { grammar, label: languageLabel } = languageEntry;
  const {
    bank: { questions },
  } = bankState;
  const playedTopic = questions.some((question) => question.topic === topic) ? topic : undefined;
  const poolSize = questions.filter((question) => playedTopic === undefined || question.topic === playedTopic).length;
  return (
    <QuizRound
      key={roundKey}
      canAsk={canAsk}
      difficulty={difficulty}
      difficultyLabel={difficultyEntry.label}
      grammar={grammar}
      language={language}
      languageLabel={languageLabel}
      onExit={() => router.replace('/')}
      onRetry={() => setRoundKey((key) => key + 1)}
      questions={questions}
      sampleSize={readRoundCount(count, poolSize)}
      topic={playedTopic}
    />
  );
}
