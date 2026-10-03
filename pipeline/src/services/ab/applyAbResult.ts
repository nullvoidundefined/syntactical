// Records an A/B validation on its card: a passing result's evidence becomes
// `criterion.evidence`, and `provenance.validation` takes the result's method and status. The
// runtime version is kept only for an executed pass, so a judged card never carries one and
// never earns the verified badge. `isHumanReviewed` is left exactly as it was: only a person
// sets it.
import type { Provenance } from '@syntactical/content-schema';

import type { AbQuestion } from '../../types/ab/AbQuestion.js';
import type { AbValidationResult } from '../../types/ab/AbValidationResult.js';

function buildProvenance(provenance: Provenance, result: AbValidationResult): Provenance {
    const { method, runtimeVersion, status } = result;
    const next: Provenance = { ...provenance, validation: { method, status } };
    delete next.runtimeVersion;
    if (method === 'executed' && status === 'passed' && runtimeVersion !== undefined) {
        next.runtimeVersion = runtimeVersion;
    }
    return next;
}

export function applyAbResult(question: AbQuestion, result: AbValidationResult): AbQuestion {
    const { criterion, provenance } = question;
    const { evidence, status } = result;
    return {
        ...question,
        criterion: status === 'passed' && evidence !== undefined ? { ...criterion, evidence } : criterion,
        provenance: buildProvenance(provenance, result),
    };
}
