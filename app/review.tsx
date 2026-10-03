// Review route: once stats hydrate, snapshots the due questions from the
// on-device review queue (local banks only, so it works offline) and plays
// them as a review round, or shows when the next review comes due. Retry
// remounts the round over the same snapshot.
import { useState } from 'react';

import { router } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { DIFFICULTIES } from '@syntactical/content-schema';
import type { Manifest } from '@syntactical/content-schema';

import { QuizRound, type QuestionSource } from '../components/quiz/QuizRound';
import { NothingDue } from '../components/review/NothingDue';
import type { ReviewQuestion } from '../services/review/types/ReviewQuestion';
import { useQuizStats } from '../state/StatsProvider';
import { useLanguageManifest } from '../state/useLanguageManifest';
import { useReviewQueue } from '../state/useReviewQueue';

const ROUND_SOURCE: QuestionSource = {
  difficulty: 'due',
  difficultyLabel: 'Due',
  grammar: 'python',
  language: 'review',
  languageLabel: 'Review',
};

function describeSource(reviewQuestion: ReviewQuestion, manifest: Manifest): QuestionSource {
  const { difficulty, language } = reviewQuestion;
  const { grammar = ROUND_SOURCE.grammar, label: languageLabel = language } = manifest.languages.find(({ id }) => id === language) ?? {};
  const difficultyLabel = DIFFICULTIES.find(({ id }) => id === difficulty)?.label ?? difficulty;
  return { difficulty, difficultyLabel, grammar, language, languageLabel };
}

function ReviewRound() {
  const { dueQuestions, nextDueAt } = useReviewQueue();
  const manifest = useLanguageManifest();
  const [roundKey, setRoundKey] = useState(0);
  const [snapshot] = useState(() => dueQuestions);
  const [sources] = useState(() => new Map(snapshot.map((entry) => [entry.question.id, describeSource(entry, manifest)])));
  const exitToMenu = () => router.replace('/');
  if (snapshot.length === 0) return <NothingDue nextDueAt={nextDueAt} onBack={exitToMenu} />;
  return (
    <QuizRound
      key={roundKey}
      {...ROUND_SOURCE}
      describeQuestion={({ id }) => sources.get(id) ?? ROUND_SOURCE}
      onExit={exitToMenu}
      onRetry={() => setRoundKey((key) => key + 1)}
      questions={snapshot.map(({ question }) => question)}
      roundKind="review"
    />
  );
}

export default function ReviewScreen() {
  const { isHydrated } = useQuizStats();
  if (!isHydrated) return <ActivityIndicator className="flex-1" />;
  return <ReviewRound />;
}
