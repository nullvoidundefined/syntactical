// The validation verdict for one question: the latest validate report's entry when it has one,
// otherwise what the question's own provenance records (a gap-fill question carries its passing
// run there). `judged` or `pending` validation is not a verdict, so it reads as `none`.
import type { Question } from '@syntactical/content-schema';

import type { PublishVerdict } from '../../types/publish/PublishVerdict.js';

export function verdictOf(question: Question, reported: PublishVerdict | undefined): PublishVerdict {
    if (reported !== undefined) {
        return reported;
    }
    const { runtimeVersion, validation } = question.provenance;
    const { method, status } = validation;
    if (method === 'executed' && status === 'passed') {
        return { status: 'passed', ...(runtimeVersion === undefined ? {} : { runtimeVersion }) };
    }
    return { status: status === 'failed' ? 'failed' : 'none' };
}
