// The two option snippets of an A/B question, or null when either option carries no code.
import type { AbQuestion } from '../../types/ab/AbQuestion.js';

export function readAbSnippets(question: AbQuestion): [string, string] | null {
    const [first, second] = question.choices;
    const { code: firstCode } = first;
    const { code: secondCode } = second;
    if (!firstCode?.trim() || !secondCode?.trim()) {
        return null;
    }
    return [firstCode, secondCode];
}
