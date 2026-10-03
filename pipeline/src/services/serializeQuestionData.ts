// Serializes a question as untrusted prompt data: JSON with `<` escaped, so no question
// text can close a data tag and smuggle text outside it. Shared by every prompt builder.
import type { Question } from '@syntactical/content-schema';

const JSON_INDENT = 2;

export function serializeQuestionData(question: Question): string {
    const { code, prompt } = question;
    const choices = 'choices' in question ? question.choices : undefined;
    return JSON.stringify({ choices, code, prompt }, null, JSON_INDENT).replaceAll('<', '\\u003c');
}
