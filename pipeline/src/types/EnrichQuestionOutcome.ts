// What enriching one question found (see enrichQuestion).
import type { EnrichedRationale } from './EnrichedRationale.js';

export interface EnrichQuestionOutcome {
    accepted: EnrichedRationale[];
    agreed: number;
    compared: number;
    // One entry per dropped rationale: the choice index and the closed reason.
    drops: { choiceIndex: number; reason: 'misconception-disagreement' | 'rationale-contradicts-oracle' }[];
    isInvalid: boolean;
}
