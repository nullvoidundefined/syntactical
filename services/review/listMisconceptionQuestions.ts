// The playable questions, in locally available banks the learner has
// answered from, that can reveal one misconception: the questions of a
// misconception review round, ordered by id so a retry replays them alike.
import { listQuestionMisconceptions } from './listQuestionMisconceptions';
import type { ReviewQuestion } from './types/ReviewQuestion';

export function listMisconceptionQuestions(
  questionIndex: ReadonlyMap<string, ReviewQuestion>,
  misconceptionId: string,
): ReviewQuestion[] {
  return [...questionIndex.values()]
    .filter(({ question }) => question.type !== 'ab' && listQuestionMisconceptions(question).includes(misconceptionId))
    .sort((left, right) => (left.question.id < right.question.id ? -1 : 1));
}
