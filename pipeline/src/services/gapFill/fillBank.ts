import { join } from 'node:path';

import { type Question, SUPPORTED_SCHEMA_VERSION } from '@syntactical/content-schema';
import { z } from 'zod';

import type { FillBankArgs } from '../../types/FillBankArgs.js';
import type { FillBankResult } from '../../types/FillBankResult.js';
import { writeJsonAtomic } from '../classify/writeJsonAtomic.js';
import { readExistingOracles } from '../readExistingOracles.js';

import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';
import { countQuestionsNeeded } from './countQuestionsNeeded.js';
import { generateBatch } from './generateBatch.js';
import { buildCardKey } from './buildCardKey.js';
import { normalizePrompt } from './normalizePrompt.js';
import { readJsonIfPresent } from './readJsonIfPresent.js';

const classificationsSchema = z.record(z.string(), z.looseObject({ topic: z.string() }));

const stagedSchema = z.looseObject({
    questions: z.array(z.looseObject({ id: z.string(), prompt: z.string(), topic: z.string().optional() })),
});

function countByTopic(questions: Question[], classified: Map<string, { topic: string }>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { id, topic: ownTopic } of questions) {
        const topic = classified.get(id)?.topic ?? ownTopic;
        if (topic !== undefined) {
            counts.set(topic, (counts.get(topic) ?? 0) + 1);
        }
    }
    return counts;
}

export async function fillBank(args: FillBankArgs): Promise<FillBankResult> {
    const { bankKey, difficulty, languageId, log, outRoot, questions, topics } = args;
    const result: FillBankResult = { duplicate: 0, failed: 0, generated: 0 };
    const rawClassified = await readJsonIfPresent(join(outRoot, 'classifications', languageId, `${difficulty}.json`));
    if (rawClassified === undefined) {
        log(`skipping bank ${bankKey}: no classifications, run classify first`);
        return result;
    }
    const classified = new Map(Object.entries(classificationsSchema.parse(rawClassified)));
    const stagedFile = join(outRoot, 'generated', languageId, `${difficulty}.json`);
    const rawStaged = await readJsonIfPresent(stagedFile);
    const staged = (rawStaged === undefined ? [] : stagedSchema.parse(rawStaged).questions) as Question[];
    const oracleFile = join(outRoot, 'oracles', languageId, `${difficulty}.json`);
    const oracles = await readExistingOracles(oracleFile);
    const counts = countByTopic([...questions, ...staged], classified);
    const existingKeys = new Set([...questions, ...staged].map(buildCardKey));
    const existingPrompts = new Set([...questions, ...staged].map(({ prompt }) => normalizePrompt(prompt)));
    const added: Question[] = [];
    let isCompleted = false;
    try {
        for (const topic of topics) {
            let needed = countQuestionsNeeded(counts.get(topic) ?? 0);
            for (let batch = 0; batch < 2 && needed > 0; batch += 1) {
                const requested = Math.min(10, needed);
                let outcome;
                try {
                    outcome = await generateBatch({ ...args, count: requested, existingKeys, existingPrompts, topic });
                } catch (error) {
                    if (!(error instanceof ModelOutputInvalid) && !(error instanceof ProviderTransientError))
                        throw error;
                    const reason = error instanceof ProviderTransientError ? error.reason : 'model-output-invalid';
                    result.failed += requested;
                    log(`${bankKey} ${topic}: batch of ${requested}, kept 0 (${reason}: ${requested})`);
                    break;
                }
                const { cards, drops } = outcome;
                for (const { oracle, question } of cards) {
                    existingKeys.add(buildCardKey(question));
                    existingPrompts.add(normalizePrompt(question.prompt));
                    added.push(question);
                    oracles.set(question.id, oracle);
                }
                result.generated += cards.length;
                for (const [reason, count] of Object.entries(drops))
                    result[reason === 'duplicate' ? 'duplicate' : 'failed'] += count;
                needed -= cards.length;
                const reasons = Object.entries(drops)
                    .map(([reason, count]) => `${reason}: ${count}`)
                    .join(', ');
                log(
                    `${bankKey} ${topic}: batch of ${requested}, kept ${cards.length}${reasons ? ` (${reasons})` : ''}`,
                );
            }
        }
        isCompleted = true;
    } finally {
        // An error that stops the run still stages what this bank generated so far. If that
        // write fails too, log it and let the original error stay the one that propagates.
        if (added.length > 0) {
            const stagedBody = { questions: [...staged, ...added], schemaVersion: SUPPORTED_SCHEMA_VERSION };
            if (isCompleted) {
                await writeJsonAtomic(oracleFile, Object.fromEntries(oracles));
                await writeJsonAtomic(stagedFile, stagedBody);
            } else {
                try {
                    await writeJsonAtomic(oracleFile, Object.fromEntries(oracles));
                    await writeJsonAtomic(stagedFile, stagedBody);
                } catch (writeError) {
                    log(`${bankKey}: could not stage partial results (${String(writeError)})`);
                }
            }
        }
    }
    return result;
}
