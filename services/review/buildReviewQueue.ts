// Builds the review queue on device from the answer event log: replays the
// events into review state, then lists every question item due by `now`
// whose question is in a locally available bank, most overdue first. A due
// question without a local copy is skipped, and the earliest later due
// date among playable questions is reported as the next due time.
import { buildReviewState } from '@syntactical/progress';
import type { AnswerEvent, ReviewItem } from '@syntactical/progress';

import type { ContentAccess } from '../content/types/ContentAccess';

import { buildQuestionIndex } from './buildQuestionIndex';
import { readMisconception } from './readMisconception';
import type { ReviewQueue } from './types/ReviewQueue';

function compareDue(left: ReviewItem, right: ReviewItem): number {
  const byDue = left.card.due.getTime() - right.card.due.getTime();
  if (byDue !== 0) return byDue;
  return left.id < right.id ? -1 : 1;
}

export function buildReviewQueue(events: readonly AnswerEvent[], readLocalBank: ContentAccess['readLocalBank'], now: Date): ReviewQueue {
  const questionIndex = buildQuestionIndex(events, readLocalBank);
  const reviewState = buildReviewState(events, (questionId, choiceIndex) => readMisconception(questionIndex, questionId, choiceIndex));
  const playable = Object.values(reviewState.questions)
    .filter(({ id }) => questionIndex.has(id))
    .sort(compareDue);
  const nowMs = now.getTime();
  const due = playable.filter(({ card }) => card.due.getTime() <= nowMs);
  const later = playable.find(({ card }) => card.due.getTime() > nowMs);
  return {
    dueQuestions: due.flatMap(({ id }) => questionIndex.get(id) ?? []),
    nextDueAt: later ? later.card.due.toISOString() : null,
    questionIndex,
    reviewState,
  };
}
