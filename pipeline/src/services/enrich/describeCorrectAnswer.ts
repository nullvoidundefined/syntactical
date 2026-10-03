// Names the correct answer of a question for a prompt, so the model never has to guess
// which choice is right (a bool question's data carries no answer field).
import type { Question } from '@syntactical/content-schema';

export function describeCorrectAnswer(question: Question): string {
    if ('choices' in question) {
        const { answerIndex } = question;
        return `choice index ${answerIndex}`;
    }
    const { answer } = question;
    return `the value ${String(answer)}; the wrong value ${String(!answer)} is index 0`;
}
