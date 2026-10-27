// The bank keys (`language/difficulty`) of every question review item due by `now`, replayed from the answer
// event log alone, so it needs no bank content. A misconception item names no bank; the questions that carry
// it are question items of their own.
import { buildReviewState } from '@syntactical/progress';
import type { AnswerEvent } from '@syntactical/progress';

export function listDueReviewBankKeys(events: readonly AnswerEvent[], now: Date): string[] {
  const { questions } = buildReviewState(events, () => undefined);
  const nowMs = now.getTime();
  const dueIds = new Set(
    Object.values(questions)
      .filter(({ card }) => card.due.getTime() <= nowMs)
      .map(({ id }) => id),
  );
  const bankKeys = events.filter(({ questionId }) => dueIds.has(questionId)).map(({ bankKey }) => bankKey);
  return [...new Set(bankKeys)].sort();
}
