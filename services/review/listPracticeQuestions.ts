// The questions of a review round over several misconceptions (the study note's "Practice
// these"): each misconception's local questions, ordered by id, taken in turn in the order the
// misconceptions are given, each question once, at most PRACTICE_ROUND_MAX_QUESTIONS. The order
// depends only on the ids, so a retry replays the round alike. One pass over the index groups
// the questions by misconception.
import { PRACTICE_ROUND_MAX_QUESTIONS } from '../../constants/appConfig';

import { listQuestionMisconceptions } from './listQuestionMisconceptions';
import type { ReviewQuestion } from './types/ReviewQuestion';

function byQuestionId(left: ReviewQuestion, right: ReviewQuestion): number {
  return left.question.id < right.question.id ? -1 : 1;
}

export function listPracticeQuestions(
  questionIndex: ReadonlyMap<string, ReviewQuestion>,
  misconceptionIds: readonly string[],
): ReviewQuestion[] {
  const grouped = new Map<string, ReviewQuestion[]>(misconceptionIds.map((id) => [id, []]));
  for (const entry of questionIndex.values()) {
    for (const id of listQuestionMisconceptions(entry.question)) grouped.get(id)?.push(entry);
  }
  const lists = [...grouped.values()].map((list) => list.sort(byQuestionId));
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const round = new Map<string, ReviewQuestion>();
  for (let position = 0; position < longest; position += 1) {
    for (const list of lists) {
      const entry = list[position];
      if (entry && !round.has(entry.question.id)) round.set(entry.question.id, entry);
    }
  }
  return [...round.values()].slice(0, PRACTICE_ROUND_MAX_QUESTIONS);
}
