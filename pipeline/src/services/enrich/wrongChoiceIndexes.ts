// The choice indexes that need a rationale: every choice but the correct one. A bool
// question has one wrong value, reported as index 0.
import type { Question } from '@syntactical/content-schema';

export function wrongChoiceIndexes(question: Question): number[] {
    if (!('choices' in question)) {
        return [0];
    }
    const { answerIndex, choices } = question;
    return choices.flatMap((_choice, index) => (index === answerIndex ? [] : [index]));
}
