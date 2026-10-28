// The questions of a review round over several misconceptions (the study note's "Practice
// these"): each misconception's local questions, ordered by id, taken in turn in the order the
// misconceptions are given, each question once, at most PRACTICE_ROUND_MAX_QUESTIONS. The order
// depends only on the ids, so a retry replays the round alike.
import { PRACTICE_ROUND_MAX_QUESTIONS } from '../../constants/appConfig';

import { listMisconceptionQuestions } from './listMisconceptionQuestions';
import type { ReviewQuestion } from './types/ReviewQuestion';

export function listPracticeQuestions(
  questionIndex: ReadonlyMap<string, ReviewQuestion>,
  misconceptionIds: readonly string[],
): ReviewQuestion[] {
  const lists = [...new Set(misconceptionIds)].map((id) => listMisconceptionQuestions(questionIndex, id));
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
