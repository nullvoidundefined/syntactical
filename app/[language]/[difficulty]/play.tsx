// Round route: resolves the language and difficulty against the manifest
// and the difficulty registry, waits for stats hydration and a ready
// bank, and remounts the round under a new key on Retry so every piece
// of round state resets. `?topic=<id>` plays one topic of the bank; a topic
// the bank has no questions for falls back to the whole bank.
import { useState } from 'react';

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { DIFFICULTIES } from '@syntactical/content-schema';

import NotFoundScreen from '../../+not-found';
import { QuizRound } from '../../../components/quiz/QuizRound';
import { useQuizStats } from '../../../state/StatsProvider';
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
  const { difficulty, language, topic } = useLocalSearchParams<{ difficulty: string; language: string; topic?: string }>();
  const [roundKey, setRoundKey] = useState(0);
  const { isHydrated } = useQuizStats();
  const { languages } = useLanguageManifest();
  const bankState = useQuestionBank(language, difficulty);
  const languageEntry = languages.find(({ id }) => id === language);
  const difficultyEntry = DIFFICULTIES.find(({ id }) => id === difficulty);

  const { status } = bankState;
  // A locked paid bank (no entitlement) is not playable from a deep link.
  if (!languageEntry || !difficultyEntry || status === 'unknown' || status === 'locked') return <NotFoundScreen />;
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
  return (
    <QuizRound
      key={roundKey}
      difficulty={difficulty}
      difficultyLabel={difficultyEntry.label}
      grammar={grammar}
      language={language}
      languageLabel={languageLabel}
      onExit={() => router.replace('/')}
      onRetry={() => setRoundKey((key) => key + 1)}
      questions={questions}
      topic={playedTopic}
    />
  );
}
