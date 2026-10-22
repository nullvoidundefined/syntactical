// What enriching one question found (see enrichQuestion).
import type { EnrichedRationale } from './EnrichedRationale.js';

// Why a rationale was dropped. A question with an oracle is judged against its observed output; a
// question without one is judged against its answer key by two different models, which must agree.
export type EnrichDropReason =
    | 'misconception-disagreement'
    | 'rationale-contradicts-oracle'
    | 'rationale-contradicts-key'
    | 'judges-disagree';

export interface EnrichQuestionOutcome {
    accepted: EnrichedRationale[];
    agreed: number;
    compared: number;
    // One entry per dropped rationale: the choice index and the closed reason.
    drops: { choiceIndex: number; reason: EnrichDropReason }[];
    isInvalid: boolean;
}
