// Enriches one question: writes the rationales twice and keeps a rationale only when both runs
// tag the same misconception for that choice and the judging passes. With an oracle observation
// one judge checks the rationale against the observed output. Without one, the rationale is
// grounded in the answer key and explanation, and two judges on different models must both find
// it consistent: agreement is dropped as 'rationale-contradicts-key' when both reject it and as
// 'judges-disagree' when they split. Output the schema rejects drops the whole question.
// Provider errors propagate to enrichBank, which skips transient failures and stops on others.
import type { Question } from '@syntactical/content-schema';

import type { EnrichDropReason, EnrichQuestionOutcome } from '../../types/EnrichQuestionOutcome.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';

import { judgeRationale } from './judgeRationale.js';
import { writeRationales } from './writeRationales.js';

// The drop reason for a rationale, or null when it passes judging.
async function judge(
    question: Question,
    observed: string | undefined,
    rationale: string,
    providers: { provider: ModelProvider; secondProvider?: ModelProvider },
): Promise<EnrichDropReason | null> {
    const { provider, secondProvider } = providers;
    const first = await judgeRationale(question, observed, rationale, provider);
    if (observed !== undefined) {
        return first.isConsistent ? null : 'rationale-contradicts-oracle';
    }
    if (secondProvider === undefined) {
        throw new Error('a question without an oracle observation needs a second judge provider');
    }
    const second = await judgeRationale(question, observed, rationale, secondProvider);
    if (first.isConsistent && second.isConsistent) return null;
    return first.isConsistent || second.isConsistent ? 'judges-disagree' : 'rationale-contradicts-key';
}

export async function enrichQuestion(
    question: Question,
    observed: string | undefined,
    taxonomy: readonly TaxonomyEntry[],
    provider: ModelProvider,
    secondProvider?: ModelProvider,
): Promise<EnrichQuestionOutcome> {
    const outcome: EnrichQuestionOutcome = { accepted: [], agreed: 0, compared: 0, drops: [], isInvalid: false };
    try {
        const firstRun = await writeRationales(question, observed, taxonomy, provider);
        const secondRun = await writeRationales(question, observed, taxonomy, provider);
        for (const candidate of firstRun) {
            const { choiceIndex, rationale } = candidate;
            const other = secondRun.find((each) => each.choiceIndex === choiceIndex);
            outcome.compared += 1;
            if (other?.misconceptionId !== candidate.misconceptionId) {
                outcome.drops.push({ choiceIndex, reason: 'misconception-disagreement' });
                continue;
            }
            outcome.agreed += 1;
            const reason = await judge(question, observed, rationale, { provider, secondProvider });
            if (reason === null) {
                outcome.accepted.push(candidate);
            } else {
                outcome.drops.push({ choiceIndex, reason });
            }
        }
    } catch (error) {
        if (!(error instanceof ModelOutputInvalid)) {
            throw error;
        }
        // The question is skipped whole, so nothing it tallied before the failure counts.
        return { accepted: [], agreed: 0, compared: 0, drops: [], isInvalid: true };
    }
    return outcome;
}
