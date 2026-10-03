// Reviews one bank: builds its items, merges the owner's edited checkboxes with the stored
// decisions, writes `review/decisions/<language>-<difficulty>.json`, then rewrites
// `review/<language>-<difficulty>.md` with the kept decisions pre-checked. Both files go
// under `outRoot` (the public pipeline dir for a free bank, the content root for a paid one).
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Question } from '@syntactical/content-schema';

import type { ReviewResult } from '../../types/review/ReviewResult.js';
import { writeJsonAtomic } from '../classify/writeJsonAtomic.js';
import { writeFileAtomic } from '../writeFileAtomic.js';

import { buildReviewItems } from './buildReviewItems.js';
import { fingerprintItem } from './fingerprintItem.js';
import { mergeDecisions } from './mergeDecisions.js';
import { readBankInputs } from './readBankInputs.js';
import { readReviewDecisions } from './readReviewDecisions.js';
import { readStoredDecisions } from './readStoredDecisions.js';
import { renderDecisionLines } from './renderDecisionLines.js';
import { renderReviewItem } from './renderReviewItem.js';

interface ReviewBankArgs {
    bank: Question[];
    difficulty: string;
    languageId: string;
    log: (line: string) => void;
    observe: (bankKey: string, question: Question) => Promise<string | undefined>;
    outRoot: string;
    statuses: Map<string, string>;
}

const SCHEMA_VERSION = 1;

const HEADER = [
    'Mark each item with one box: `- [x] approve`, or `- [x] reject: <why>` (a reject needs a reason).',
    'Leave an item unchecked to decide later. Then rerun `pipeline review` to record your decisions.',
    '',
].join('\n');

async function readTextIfPresent(file: string): Promise<string> {
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return '';
        }
        throw error;
    }
}

export async function reviewBank(args: ReviewBankArgs): Promise<ReviewResult> {
    const { bank, difficulty, languageId, log, observe, outRoot, statuses } = args;
    const bankKey = `${languageId}/${difficulty}`;
    const name = `${languageId}-${difficulty}`;
    const reviewFile = join(outRoot, 'review', `${name}.md`);
    const decisionsFile = join(outRoot, 'review', 'decisions', `${name}.json`);
    const items = await buildReviewItems({
        bank,
        bankKey,
        inputs: await readBankInputs(outRoot, languageId, difficulty),
        log,
        observe,
        statuses,
    });
    const { kept, problems } = mergeDecisions(
        new Map(items.map((item) => [item.id, fingerprintItem(item)])),
        readReviewDecisions(await readTextIfPresent(reviewFile)),
        await readStoredDecisions(decisionsFile),
    );
    for (const problem of problems) {
        log(`${bankKey}: review file problem, ${problem}`);
    }
    const decisions = Object.fromEntries([...kept.entries()].sort(([left], [right]) => (left < right ? -1 : 1)));
    await writeJsonAtomic(decisionsFile, { decisions, schemaVersion: SCHEMA_VERSION });
    await mkdir(dirname(reviewFile), { recursive: true });
    const body = items.map((item) => renderReviewItem(item, renderDecisionLines(kept.get(item.id)))).join('\n');
    await writeFileAtomic(reviewFile, `# Review: ${bankKey}\n\n${HEADER}\n${body}`);
    const approved = items.filter(({ id }) => kept.get(id)?.decision === 'approve').length;
    const rejected = items.filter(({ id }) => kept.get(id)?.decision === 'reject').length;
    log(`${bankKey}: ${items.length} items, ${approved} approved, ${rejected} rejected`);
    return {
        approved,
        items: items.length,
        pending: items.length - approved - rejected,
        problems: problems.length,
        rejected,
    };
}
