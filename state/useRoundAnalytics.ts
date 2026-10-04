// Fires the round analytics events, each once per round: round_started on
// mount, round_completed (a bank or topic round) or review_round_completed
// when the round ends, and bank_exhausted when this round's answers make
// every question of the bank answered at least once. A review round mixes
// banks, so it carries no bank properties and never exhausts one.
import { useEffect, useRef } from 'react';

import type { Question } from '@syntactical/content-schema';

import { trackEvent } from '../clients/analyticsClient';
import { isBankExhausted } from '../services/analytics/isBankExhausted';

import { useQuizStats } from './StatsProvider';
import type { RoundKind } from './useQuizEngine';

type RoundAnalytics = {
  bankQuestions: readonly Question[];
  correctCount: number;
  difficulty: string;
  isComplete: boolean;
  language: string;
  roundKind: RoundKind;
  topic?: string;
  totalQuestions: number;
};

// A review round mixes banks, so it names none.
function describeBank(
  roundKind: RoundKind,
  difficulty: string,
  language: string,
): Record<string, string> {
  return roundKind === 'review' ? {} : { difficulty, language };
}

export function useRoundAnalytics(round: RoundAnalytics): void {
  const {
    bankQuestions,
    correctCount,
    difficulty,
    isComplete,
    language,
    roundKind,
    topic,
    totalQuestions,
  } = round;
  const { eventLog, isHydrated } = useQuizStats();
  const hasStarted = useRef(false);
  const hasCompleted = useRef(false);
  const wasExhaustedAtStart = useRef<boolean | null>(null);
  const hasReportedExhaustion = useRef(false);
  const kind = roundKind === 'bank' && topic !== undefined ? 'topic' : roundKind;

  // A round reports its start once; later changes to these values do not restart it.
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    trackEvent('round_started', {
      roundKind: kind,
      totalQuestions,
      ...describeBank(roundKind, difficulty, language),
    });
  }, [difficulty, kind, language, roundKind, totalQuestions]);

  useEffect(() => {
    if (!isComplete || totalQuestions === 0 || hasCompleted.current) return;
    hasCompleted.current = true;
    const name = roundKind === 'review' ? 'review_round_completed' : 'round_completed';
    trackEvent(name, {
      correctCount,
      roundKind: kind,
      totalQuestions,
      ...describeBank(roundKind, difficulty, language),
    });
  }, [correctCount, difficulty, language, isComplete, kind, roundKind, totalQuestions]);

  useEffect(() => {
    if (roundKind === 'review' || !isHydrated || hasReportedExhaustion.current) return;
    const isExhausted = isBankExhausted(`${language}/${difficulty}`, bankQuestions, eventLog);
    if (wasExhaustedAtStart.current === null) {
      wasExhaustedAtStart.current = isExhausted;
      return;
    }
    if (!isExhausted || wasExhaustedAtStart.current) return;
    hasReportedExhaustion.current = true;
    trackEvent('bank_exhausted', {
      difficulty,
      language,
      totalQuestions: bankQuestions.length,
    });
  }, [bankQuestions, difficulty, eventLog, isHydrated, language, roundKind]);
}
