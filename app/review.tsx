// Review route: once stats and the content cache hydrate, snapshots the due questions from the
// on-device review queue (local banks only, so it works offline) and plays
// them as a review round, or shows when the next review comes due. With a
// `misconception` parameter (from the weakness report) it plays that
// misconception's questions instead, labelled "Weak spot"; with a
// comma-separated `misconceptions` parameter (the study note's "Practice
// these") it plays up to 10 of their questions, taken in turn, labelled
// "Weak spots" when more than one of them has a question in the round.
// Retry remounts the round over the same snapshot.
import { useState } from 'react';

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import type { Manifest } from '@syntactical/content-schema';

import { QuizRound, type QuestionSource } from '../components/quiz/QuizRound';
import { NothingDue } from '../components/review/NothingDue';
import { findDifficulty } from '../services/content/findDifficulty';
import { findLanguageEntry } from '../services/content/findLanguageEntry';
import { listMisconceptionQuestions } from '../services/review/listMisconceptionQuestions';
import { listPracticeQuestions } from '../services/review/listPracticeQuestions';
import { listQuestionMisconceptions } from '../services/review/listQuestionMisconceptions';
import type { ReviewQuestion } from '../services/review/types/ReviewQuestion';
import type { ReviewQueue } from '../services/review/types/ReviewQueue';
import { useContentContext } from '../state/ContentProvider';
import { useQuizStats } from '../state/StatsProvider';
import { useCanAsk } from '../state/useCanAsk';
import { useLanguageManifest } from '../state/useLanguageManifest';
import { useReviewQueue } from '../state/useReviewQueue';

const ROUND_SOURCE: QuestionSource = {
  difficulty: 'due',
  difficultyLabel: 'Due',
  grammar: 'python',
  language: 'review',
  languageLabel: 'Review',
};

// Which questions the round plays: the due ones, one misconception's, or several misconceptions'.
type RoundFocus = { kind: 'due' } | { id: string; kind: 'misconception' } | { ids: string[]; kind: 'misconceptions' };

type RoundSnapshot = { difficultyLabel: string; questions: ReviewQuestion[] };

function readFocus(
  misconception: string | string[] | undefined,
  misconceptions: string | string[] | undefined,
): RoundFocus {
  const ids = [misconceptions ?? []]
    .flat()
    .flatMap((value) => value.split(','))
    .map((id) => id.trim())
    .filter((id) => id !== '');
  if (ids.length > 0) return { ids, kind: 'misconceptions' };
  if (typeof misconception === 'string' && misconception !== '') return { id: misconception, kind: 'misconception' };
  return { kind: 'due' };
}

function snapshotRound(focus: RoundFocus, { dueQuestions, questionIndex }: ReviewQueue): RoundSnapshot {
  if (focus.kind === 'due') return { difficultyLabel: ROUND_SOURCE.difficultyLabel, questions: dueQuestions };
  if (focus.kind === 'misconception') {
    return { difficultyLabel: 'Weak spot', questions: listMisconceptionQuestions(questionIndex, focus.id) };
  }
  const questions = listPracticeQuestions(questionIndex, focus.ids);
  const revealed = new Set(questions.flatMap(({ question }) => listQuestionMisconceptions(question)));
  const covered = new Set(focus.ids.filter((id) => revealed.has(id)));
  return { difficultyLabel: covered.size > 1 ? 'Weak spots' : 'Weak spot', questions };
}

function describeSource(reviewQuestion: ReviewQuestion, manifest: Manifest): QuestionSource {
  const { difficulty, language } = reviewQuestion;
  const { grammar = ROUND_SOURCE.grammar, label: languageLabel = language } =
    findLanguageEntry(manifest.languages, language) ?? {};
  const difficultyLabel = findDifficulty(difficulty)?.label ?? difficulty;
  return { difficulty, difficultyLabel, grammar, language, languageLabel };
}

function ReviewRound({ focus }: { focus: RoundFocus }) {
  const reviewQueue = useReviewQueue();
  const canAsk = useCanAsk();
  const manifest = useLanguageManifest();
  const [roundKey, setRoundKey] = useState(0);
  const [{ difficultyLabel, questions: snapshot }] = useState(() => snapshotRound(focus, reviewQueue));
  const [sources] = useState(
    () => new Map(snapshot.map((entry) => [entry.question.id, describeSource(entry, manifest)])),
  );
  const exitToMenu = () => router.replace('/');
  if (snapshot.length === 0) return <NothingDue nextDueAt={reviewQueue.nextDueAt} onBack={exitToMenu} />;
  return (
    <QuizRound
      key={roundKey}
      canAsk={canAsk}
      {...ROUND_SOURCE}
      difficultyLabel={difficultyLabel}
      describeQuestion={({ id }) => sources.get(id) ?? ROUND_SOURCE}
      onExit={exitToMenu}
      onRetry={() => setRoundKey((key) => key + 1)}
      questions={snapshot.map(({ question }) => question)}
      roundKind="review"
    />
  );
}

export default function ReviewScreen() {
  const { misconception, misconceptions } = useLocalSearchParams<{
    misconception?: string | string[];
    misconceptions?: string | string[];
  }>();
  const { isHydrated: isStatsHydrated } = useQuizStats();
  const { isHydrated: isContentHydrated } = useContentContext();
  // The round is a snapshot, so it waits for the cached Medium and Hard banks as well as the stats.
  if (!isStatsHydrated || !isContentHydrated) return <ActivityIndicator className="flex-1" />;
  return <ReviewRound focus={readFocus(misconception, misconceptions)} />;
}
