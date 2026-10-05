// The validation verdict for one question: the latest validate report's entry when it has one,
// otherwise what the question's own provenance records (a gap-fill question carries its passing
// run there). Judged and passed with valid evidence is also a verdict; pending or missing
// evidence cannot qualify a judged card for automatic publishing.
import { isValidProvenance, type Question } from '@syntactical/content-schema';

import type { PublishVerdict } from '../../types/publish/PublishVerdict.js';

export function verdictOf(question: Question, reported: PublishVerdict | undefined): PublishVerdict {
    if (reported !== undefined) {
        return reported;
    }
    const { runtimeVersion, validation } = question.provenance;
    const { evidence, method, status } = validation;
    if (method === 'executed' && status === 'passed') {
        return { status: 'passed', ...(runtimeVersion === undefined ? {} : { runtimeVersion }) };
    }
    if (
        method === 'judged' &&
        status === 'passed' &&
        evidence !== undefined &&
        isValidProvenance(question.provenance)
    ) {
        return { evidence, method: 'judged', status: 'passed' };
    }
    return { status: status === 'failed' ? 'failed' : 'none' };
}
