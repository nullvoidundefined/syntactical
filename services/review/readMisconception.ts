// The misconception a chosen answer reveals: the chosen choice's tag on a
// multiple choice or A/B question, or the question's own tag for a wrong
// true/false answer (choice index 0 is True, 1 is False). Undefined when
// the question is unknown, the answer was right, or nothing is tagged.
import type { ReviewQuestion } from './types/ReviewQuestion';

export function readMisconception(
  questionIndex: ReadonlyMap<string, ReviewQuestion>,
  questionId: string,
  choiceIndex: number,
): string | undefined {
  const question = questionIndex.get(questionId)?.question;
  if (!question) return undefined;
  if (question.type === 'bool') {
    const { answer, misconceptionId } = question;
    const isWrong = (choiceIndex === 0) !== answer;
    return isWrong ? misconceptionId : undefined;
  }
  const { answerIndex, choices } = question;
  return choiceIndex === answerIndex ? undefined : choices[choiceIndex]?.misconceptionId;
}
