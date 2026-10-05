// A card's grammar overrides its entry's default for code, choices, and the query.
import type { Grammar, Question } from '@syntactical/content-schema';

export function resolveQuestionGrammar(question: Pick<Question, 'grammar'>, entryGrammar: Grammar): Grammar {
  return question.grammar ?? entryGrammar;
}
