// Reports a missing or oversized wrong-answer rationale. Batch cards must carry their
// rationales so they can be published without enrich.
import { CONTENT_LIMITS, type Question } from '@syntactical/content-schema';

const FEEDBACK = `every wrong choice needs a rationale of at most ${CONTENT_LIMITS.rationaleLength} characters`;

function isUsable(rationale: string | undefined): boolean {
    return (
        typeof rationale === 'string' &&
        rationale.trim().length > 0 &&
        rationale.length <= CONTENT_LIMITS.rationaleLength
    );
}

export function findMissingRationale(question: Question): string | null {
    if (question.type === 'bool') return isUsable(question.rationale) ? null : FEEDBACK;
    const { answerIndex, choices } = question;
    const wrong = choices.filter((_choice, index) => index !== answerIndex);
    return wrong.every((choice) => isUsable(choice.rationale)) ? null : FEEDBACK;
}
