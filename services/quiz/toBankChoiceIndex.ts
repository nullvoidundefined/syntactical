// The choice index the server knows an answer by: a multiple choice answer maps from its shuffled
// position on the card back to the bank's order; true/false and A/B answers are not shuffled.
import type { RoundQuestion } from './shuffleChoices';
import { toChoiceIndex } from './toChoiceIndex';

export function toBankChoiceIndex(question: RoundQuestion, value: number | boolean): number {
  const displayedChoiceIndex = toChoiceIndex(value);
  return question.type === 'mc' ? question.bankChoiceIndexes[displayedChoiceIndex] : displayedChoiceIndex;
}
