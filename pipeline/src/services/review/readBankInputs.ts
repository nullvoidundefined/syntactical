// Reads what the classify, gap-fill, and enrich stages staged for one bank under `outRoot`:
// `classifications/<language>/<difficulty>.json` (id to topic), `review-queue/<language>/
// <difficulty>/<id>.json`, `generated/<language>/<difficulty>.json` (a question bank), and
// `enrichment/<language>/<difficulty>.json` (id to rationales). Each is optional: a stage
// that has not run for this bank contributes nothing. Shapes are checked loosely, so a
// later change to a stage's extra fields does not break the review.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { z } from 'zod';

import type { ReviewBankInputs } from '../../types/review/ReviewBankInputs.js';

import { isSafeItemId } from './isSafeItemId.js';
import { readOptionalJson } from './readOptionalJson.js';

const classificationsSchema = z.record(z.string(), z.looseObject({ topic: z.string() }));
const enrichmentSchema = z.record(
    z.string(),
    z.array(z.looseObject({ choiceIndex: z.number(), misconceptionId: z.string(), rationale: z.string() })),
);
const generatedSchema = z.looseObject({ questions: z.array(z.looseObject({ id: z.string() })) });
const queueEntrySchema = z.looseObject({
    id: z.string(),
    reason: z.string().optional(),
    suggestedTopic: z.string().optional(),
});

async function listJsonFiles(dir: string): Promise<string[]> {
    try {
        return (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

export async function readBankInputs(
    outRoot: string,
    languageId: string,
    difficulty: string,
    log: (line: string) => void,
): Promise<ReviewBankInputs> {
    const bankFile = `${difficulty}.json`;
    const rawClassifications = await readOptionalJson(join(outRoot, 'classifications', languageId, bankFile));
    const rawEnrichment = await readOptionalJson(join(outRoot, 'enrichment', languageId, bankFile));
    const rawGenerated = await readOptionalJson(join(outRoot, 'generated', languageId, bankFile));
    const queueDir = join(outRoot, 'review-queue', languageId, difficulty);
    const queue: ReviewBankInputs['queue'] = [];
    for (const name of await listJsonFiles(queueDir)) {
        const entry = queueEntrySchema.parse(JSON.parse(await readFile(join(queueDir, name), 'utf8')));
        const { id, reason, suggestedTopic } = entry;
        queue.push({
            id,
            ...(reason === undefined ? {} : { reason }),
            ...(suggestedTopic === undefined ? {} : { suggestedTopic }),
        });
    }
    const keepSafe = <T>(entries: T[], idOf: (entry: T) => string, what: string): T[] => {
        const safe = entries.filter((entry) => isSafeItemId(idOf(entry)));
        if (safe.length < entries.length) {
            log(`${languageId}/${difficulty}: skipped ${entries.length - safe.length} ${what} with an unsafe id`);
        }
        return safe;
    };
    const enrichment =
        rawEnrichment === undefined
            ? {}
            : Object.fromEntries(
                  keepSafe(Object.entries(enrichmentSchema.parse(rawEnrichment)), ([id]) => id, 'enrichment entries'),
              );
    return {
        classifications: rawClassifications === undefined ? {} : classificationsSchema.parse(rawClassifications),
        enrichment,
        generated:
            rawGenerated === undefined
                ? []
                : (keepSafe(generatedSchema.parse(rawGenerated).questions, ({ id }) => id, 'generated questions') as Question[]),
        queue: keepSafe(queue, ({ id }) => id, 'review-queue entries'),
    };
}
