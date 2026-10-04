// A bank is exhausted when every one of its questions has at least one answer
// event in the log. An empty bank is never exhausted.
import type { Question } from '@syntactical/content-schema';

import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

export function isBankExhausted(
  bankKey: string,
  questions: readonly Question[],
  eventLog: readonly LoggedAnswerEvent[],
): boolean {
  if (questions.length === 0) return false;
  const answeredIds = new Set(
    eventLog.filter((event) => event.bankKey === bankKey).map((event) => event.questionId),
  );
  return questions.every((question) => answeredIds.has(question.id));
}
