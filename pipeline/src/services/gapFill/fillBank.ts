// Tops up every thin topic of one bank. Topic counts come from the classify output plus
// what is already staged, so a rerun fills the gap instead of overshooting. Kept questions
// go to `<outRoot>/generated/<language>/<difficulty>.json`, never into the content bank
// file (publish does that). A bank with no classification file is skipped: without topic
// counts every topic would look empty. A draft dropped for a transient provider failure
// is counted as failed; MAX_CONSECUTIVE_PROVIDER_FAILURES of them in a row stop the run.
import { join } from 'node:path';

import { type Question, SUPPORTED_SCHEMA_VERSION } from '@syntactical/content-schema';
import { z } from 'zod';

import type { FillBankArgs } from '../../types/FillBankArgs.js';
import type { FillBankResult } from '../../types/FillBankResult.js';
import type { GenerateOutcome } from '../../types/GenerateOutcome.js';
import { writeJsonAtomic } from '../classify/writeJsonAtomic.js';

import { MAX_CONSECUTIVE_PROVIDER_FAILURES } from './MAX_CONSECUTIVE_PROVIDER_FAILURES.js';
import { countQuestionsNeeded } from './countQuestionsNeeded.js';
import { generateQuestion } from './generateQuestion.js';
import { generateTopicQuestion } from './generateTopicQuestion.js';
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

function generateFor(
    args: FillBankArgs,
    topic: string,
    existingPrompts: ReadonlySet<string>,
): Promise<GenerateOutcome> {
    const { difficulty, languageId, provider, run } = args;
    const shared = { difficulty, existingPrompts, languageId, provider, topic, ...(run === undefined ? {} : { run }) };
    return args.runners === undefined
        ? generateQuestion({ ...shared, language: args.language })
        : generateTopicQuestion({ ...shared, runners: args.runners });
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
    const counts = countByTopic([...questions, ...staged], classified);
    const existingPrompts = new Set([...questions, ...staged].map(({ prompt }) => normalizePrompt(prompt)));
    const added: Question[] = [];
    let providerFailures = 0;
    let isCompleted = false;
    try {
        for (const topic of topics) {
            const needed = countQuestionsNeeded(counts.get(topic) ?? 0);
            if (needed > 0) {
                log(`${bankKey} ${topic}: requesting ${needed}`);
            }
            for (let index = 0; index < needed; index += 1) {
                const outcome = await generateFor(args, topic, existingPrompts);
                const isProviderFailure =
                    outcome.status === 'dropped' &&
                    (outcome.reason === 'model-timeout' || outcome.reason === 'model-error');
                providerFailures = isProviderFailure ? providerFailures + 1 : 0;
                if (outcome.status === 'kept') {
                    const { question } = outcome;
                    const { id, prompt } = question;
                    existingPrompts.add(normalizePrompt(prompt));
                    added.push(question);
                    result.generated += 1;
                    log(`${bankKey} ${topic}: generated ${id}`);
                } else {
                    const { reason } = outcome;
                    result[reason === 'duplicate' ? 'duplicate' : 'failed'] += 1;
                    log(`${bankKey} ${topic}: dropped (${reason})`);
                }
                if (providerFailures >= MAX_CONSECUTIVE_PROVIDER_FAILURES) {
                    throw new Error(
                        `${bankKey}: stopping after ${providerFailures} consecutive model failures (timeout or non-zero exit)`,
                    );
                }
            }
        }
        isCompleted = true;
    } finally {
        // An error that stops the run still stages what this bank generated so far. If that
        // write fails too, log it and let the original error stay the one that propagates.
        if (added.length > 0) {
            const stagedBody = { questions: [...staged, ...added], schemaVersion: SUPPORTED_SCHEMA_VERSION };
            if (isCompleted) {
                await writeJsonAtomic(stagedFile, stagedBody);
            } else {
                try {
                    await writeJsonAtomic(stagedFile, stagedBody);
                } catch (writeError) {
                    log(`${bankKey}: could not stage partial results (${String(writeError)})`);
                }
            }
        }
    }
    return result;
}
