// Enriches every question of one bank and writes
// `<outRoot>/enrichment/<language>/<difficulty>.json` (question id to its accepted
// rationales). Content bank files are never touched: publish merges enrichment later.
// A question with no oracle observation is skipped, because every rationale must be
// conditioned on what the code really does.
import { join } from 'node:path';

import type { EnrichBankArgs } from '../../types/EnrichBankArgs.js';
import type { EnrichBankResult } from '../../types/EnrichBankResult.js';
import { writeJsonAtomic } from '../classify/writeJsonAtomic.js';

import { enrichQuestion } from './enrichQuestion.js';
import { readEnrichment } from './readEnrichment.js';

export async function enrichBank(args: EnrichBankArgs): Promise<EnrichBankResult> {
    const { bankKey, difficulty, languageId, log, observe, outRoot, provider, questions, taxonomy } = args;
    const result: EnrichBankResult = { accepted: 0, agreed: 0, compared: 0, contradicted: 0, dropped: 0 };
    const file = join(outRoot, 'enrichment', languageId, `${difficulty}.json`);
    // Merge into the earlier file: a question skipped or fully dropped now keeps what it had.
    const enriched = await readEnrichment(file);
    let freshCount = 0;
    for (const question of questions) {
        const { id } = question;
        const observed = await observe(question);
        if (observed === undefined) {
            log(`${bankKey} ${id}: skipped, no oracle observation to condition on`);
            continue;
        }
        const outcome = await enrichQuestion(question, observed, taxonomy, provider);
        const { accepted, agreed, compared, drops, isInvalid } = outcome;
        result.agreed += agreed;
        result.compared += compared;
        result.accepted += accepted.length;
        result.dropped += drops.length;
        if (isInvalid) {
            log(`${bankKey} ${id}: skipped, model-output-invalid`);
        }
        for (const { choiceIndex, reason } of drops) {
            result.contradicted += reason === 'rationale-contradicts-oracle' ? 1 : 0;
            log(`${bankKey} ${id} choice ${choiceIndex}: dropped (${reason})`);
        }
        if (accepted.length > 0) {
            enriched.set(id, accepted);
            freshCount += 1;
        }
    }
    // A run that enriched nothing leaves the file alone (no `{}` over earlier results).
    if (freshCount > 0) {
        await writeJsonAtomic(file, Object.fromEntries(enriched));
    }
    log(`${bankKey}: ${result.accepted} rationales written for ${freshCount} of ${questions.length} questions`);
    return result;
}
