// Publishes one bank: merges staged topics, generated and disputed questions, and enrichment into the
// source questions, drops each question that is neither validation `passed` nor human-reviewed
// (and any that failed or the owner rejected), then runs `validateBankForPublish` and refuses the
// whole bank, writing nothing, on any problem. The bank file goes to `bankFile` only.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type Question, SUPPORTED_SCHEMA_VERSION, validateBankForPublish } from '@syntactical/content-schema';

import type { PublishBankArgs } from '../../types/publish/PublishBankArgs.js';
import type { PublishBankResult } from '../../types/publish/PublishBankResult.js';
import type { RefusedQuestion } from '../../types/publish/RefusedQuestion.js';
import { readEnrichment } from '../enrich/readEnrichment.js';
import { writeFileAtomic } from '../writeFileAtomic.js';

import { applyStaging } from './applyStaging.js';
import { decideQuestion } from './decideQuestion.js';
import { readClassifiedTopics } from './readClassifiedTopics.js';
import { readDisputedQuestions } from './readDisputedQuestions.js';
import { readGeneratedQuestions } from './readGeneratedQuestions.js';
import { readPublishDecisions } from './readPublishDecisions.js';
import { verdictOf } from './verdictOf.js';

const JSON_INDENT = 2;

export async function publishBank(args: PublishBankArgs): Promise<PublishBankResult> {
    const { bankFile, bankKey, context, difficulty, languageId, log, outRoot, reported, source } = args;
    const topics = await readClassifiedTopics(outRoot, languageId, difficulty);
    const decisions = await readPublishDecisions(outRoot, languageId, difficulty);
    const enrichment = await readEnrichment(join(outRoot, 'enrichment', languageId, `${difficulty}.json`));
    const sourceIds = new Set(source.map(({ id }) => id));
    const generated = (await readGeneratedQuestions(outRoot, languageId, difficulty)).filter(
        ({ id }) => !sourceIds.has(id),
    );
    const knownIds = new Set([...sourceIds, ...generated.map(({ id }) => id)]);
    const disputed = (await readDisputedQuestions(outRoot, languageId, difficulty)).filter(
        ({ id }) => !knownIds.has(id),
    );
    const accepted: Question[] = [];
    const refused: RefusedQuestion[] = [];
    for (const question of [...source, ...generated, ...disputed]) {
        const { id } = question;
        const merged = applyStaging(question, topics.get(id), enrichment.get(id));
        const outcome = decideQuestion(merged, verdictOf(merged, reported.get(id)), decisions.get(id));
        if ('question' in outcome) {
            const { question: kept } = outcome;
            accepted.push(kept);
        } else {
            const { reason } = outcome;
            refused.push({ id, reason });
            log(`${bankKey} ${id}: refused (${reason})`);
        }
    }
    const { problems } = validateBankForPublish({ questions: accepted }, context);
    if (accepted.length === 0) {
        problems.push({ id: bankKey, rule: 'empty-bank' });
    }
    if (problems.length > 0) {
        log(
            `${bankKey}: bank refused, nothing written (${problems.map(({ id, rule }) => `${id} ${rule}`).join('; ')})`,
        );
        return { isWritten: false, problems, refused, written: 0 };
    }
    await mkdir(dirname(bankFile), { recursive: true });
    await writeFileAtomic(
        bankFile,
        `${JSON.stringify({ questions: accepted, schemaVersion: SUPPORTED_SCHEMA_VERSION }, null, JSON_INDENT)}\n`,
    );
    log(`${bankKey}: published ${accepted.length} questions, refused ${refused.length}`);
    return { isWritten: true, problems: [], refused, written: accepted.length };
}
