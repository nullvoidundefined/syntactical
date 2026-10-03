// Decides whether one question may be published (B-22). A rejection by the owner refuses it.
// A `failed` validation refuses it even when a human approved it: review never overrides a
// failed oracle. A `passed` validation publishes it as executed and passed. Anything else
// (`not-executable`, or not in the report) publishes only when a human approved it, and stays
// `pending`, so the client never shows the verified badge for it.
import type { Question } from '@syntactical/content-schema';

import type { PublishDecision } from '../../types/publish/PublishDecision.js';
import type { PublishVerdict } from '../../types/publish/PublishVerdict.js';
import type { RefusedQuestion } from '../../types/publish/RefusedQuestion.js';

export function decideQuestion(
    question: Question,
    verdict: PublishVerdict,
    decision: PublishDecision | undefined,
): { question: Question } | { reason: RefusedQuestion['reason'] } {
    const { provenance } = question;
    const { runtimeVersion, status } = verdict;
    const { decision: verdictOfOwner, isHumanReviewed: isMarkedReviewed } = decision ?? {};
    const isHumanReviewed = isMarkedReviewed === true && verdictOfOwner === 'approve';
    if (verdictOfOwner === 'reject') {
        return { reason: 'rejected' };
    }
    if (status === 'failed') {
        return { reason: 'validation-failed' };
    }
    if (status === 'passed') {
        const validation = { method: 'executed', status: 'passed' } as const;
        return {
            question: {
                ...question,
                provenance: {
                    ...provenance,
                    isHumanReviewed,
                    validation,
                    ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
                },
            },
        };
    }
    if (!isHumanReviewed) {
        return { reason: 'unvalidated-unreviewed' };
    }
    return {
        question: {
            ...question,
            provenance: { ...provenance, isHumanReviewed, validation: { ...provenance.validation, status: 'pending' } },
        },
    };
}
