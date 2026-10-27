// Round route: resolves the language and difficulty against the manifest
// and the difficulty registry, waits for stats hydration and a ready
// bank, and remounts the round under a new key on Retry so every piece
// of round state resets. `?topic=<id>` plays one topic of the bank; a topic
// the bank has no questions for falls back to the whole bank. `?count=20|50`
// plays a random sample of that many from the pool, when smaller than it.
import { useState } from 'react';

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import NotFoundScreen from '../../+not-found';
import { QuizRound } from '../../../components/quiz/QuizRound';
import { findDifficulty } from '../../../services/content/findDifficulty';
import { findLanguageEntry } from '../../../services/content/findLanguageEntry';
import { readRoundCount } from '../../../services/quiz/roundLength';
import { useQuizStats } from '../../../state/StatsProvider';
import { useCanAsk } from '../../../state/useCanAsk';
import { useLanguageManifest } from '../../../state/useLanguageManifest';
import { useQuestionBank } from '../../../state/useQuestionBank';

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
  const { isHydrated } = useQuizStats();
  const canAsk = useCanAsk();
  const { languages } = useLanguageManifest();
  const bankState = useQuestionBank(language, difficulty);
  const languageEntry = findLanguageEntry(languages, language);
  const difficultyEntry = findDifficulty(difficulty);

  const { status } = bankState;
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
