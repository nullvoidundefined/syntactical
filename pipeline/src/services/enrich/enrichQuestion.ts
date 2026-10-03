// Enriches one question: writes the rationales twice, keeps a rationale only when both
// runs tag the same misconception for that choice and the judge finds it consistent with
// the oracle's observed output. Output the schema rejects drops the whole question.
import type { Question } from '@syntactical/content-schema';

import type { EnrichQuestionOutcome } from '../../types/EnrichQuestionOutcome.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';

import { judgeRationale } from './judgeRationale.js';
import { writeRationales } from './writeRationales.js';

export async function enrichQuestion(
    question: Question,
    observed: string,
    taxonomy: readonly TaxonomyEntry[],
    provider: ModelProvider,
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
            const { isConsistent } = await judgeRationale(question, observed, rationale, provider);
            if (isConsistent) {
                outcome.accepted.push(candidate);
            } else {
                outcome.drops.push({ choiceIndex, reason: 'rationale-contradicts-oracle' });
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
