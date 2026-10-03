// The outcome of validating one A/B card. `evidence` is the text the card's criterion
// stores (the failing edge case, the benchmark line, or the rubric reason). A `judged`
// result never carries a runtime version, so it can never earn the verified badge.
import type { AbFailureReason } from './AbFailureReason.js';

export interface AbValidationResult {
    evidence?: string;
    method: 'executed' | 'judged';
    reason?: AbFailureReason;
    runtimeVersion?: string;
    status: 'failed' | 'passed';
}
