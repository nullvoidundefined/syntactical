// Classifies every question of one bank and writes its outputs under `outRoot`: a
// review-queue file per untrusted result (ids, suggested topic, reason only; no question
// text) and `classifications/<language>/<difficulty>.json` for accepted topics. Content
// files are never touched.
import { join } from 'node:path';

import type { BankResult } from '../../types/BankResult.js';
import type { ClassifyBankArgs } from '../../types/ClassifyBankArgs.js';

import { classifyTwice } from './classifyTwice.js';
import { isWtfOveruse } from './isWtfOveruse.js';
import { removeFileIfPresent } from './removeFileIfPresent.js';
import { writeJsonAtomic } from './writeJsonAtomic.js';

// A question id becomes a file name, so it must be a plain slug.
const SAFE_QUESTION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export async function classifyBank(args: ClassifyBankArgs): Promise<BankResult> {
    const { bankKey, difficulty, languageId, log, outRoot, provider, questions, topics } = args;
    const accepted: Record<string, { confidence: number; topic: string }> = {};
    const suggested: string[] = [];
    const result: BankResult = {
        accepted: 0,
        agreed: 0,
        compared: 0,
        isWtfOveruse: false,
        queued: 0,
    };
    for (const question of questions) {
        const { id } = question;
        if (typeof id !== 'string' || !SAFE_QUESTION_ID.test(id)) {
            log(`${bankKey}: skipped a question with an unsafe id`);
            continue;
        }
        const outcome = await classifyTwice(question, topics, provider);
        const { confidence, isAgreed, reason, topic } = outcome;
        const queueFile = join(outRoot, 'review-queue', `${id}.json`);
        if (isAgreed !== undefined) {
            result.compared += 1;
            result.agreed += isAgreed ? 1 : 0;
        }
        if (topic !== undefined) {
            suggested.push(topic);
        }
        if (reason === undefined && topic !== undefined && confidence !== undefined) {
            result.accepted += 1;
            accepted[id] = { confidence, topic };
            await removeFileIfPresent(queueFile);
            continue;
        }
        result.queued += 1;
        await writeJsonAtomic(queueFile, {
            bankKey,
            confidence,
            id,
            reason,
            suggestedTopic: topic,
        });
        log(`${bankKey} ${id}: sent to the review queue (${reason})`);
    }
    await writeJsonAtomic(join(outRoot, 'classifications', languageId, `${difficulty}.json`), accepted);
    log(`${bankKey}: ${result.accepted} of ${questions.length} classified`);
    result.isWtfOveruse = isWtfOveruse(suggested);
    return result;
}
