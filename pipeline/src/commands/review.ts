// `pipeline review`: the file-based human review stage (B-22). For each bank it writes
// `review/<language>-<difficulty>.md` listing every pending item (review-queue entries,
// generated questions, questions whose validation is not `passed`, enrichment awaiting
// approval) plus a deterministic 10% sample (minimum 3) of executed questions, each with
// its question, oracle output, proposed topic, and rationales and two checkboxes the owner
// edits: `- [ ] approve` and `- [ ] reject: <reason>`.
//
// Rerunning reads the owner's edited file first and records the decisions in
// `review/decisions/<language>-<difficulty>.json` (an approval sets
// `provenance.isHumanReviewed = true`; publish consumes that file), then rewrites the
// review file with the kept decisions pre-checked. A decision is kept only while its item
// is unchanged. Content bank files are only read, never written.
//
// Free-bank output goes under `pipelineDir`. Paid-bank output carries paid question text,
// so it goes under `contentRoot` (the private content repo), never under `pipelineDir`.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import type { ReviewResult } from '../types/review/ReviewResult.js';
import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { createOracleSource } from '../services/createOracleSource.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { resolveBankFile } from '../services/resolveBankFile.js';
import { resolveBankOutputRoot } from '../services/resolveBankOutputRoot.js';
import { reviewBank } from '../services/review/reviewBank.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';

import { validateQuestion } from '../services/validateQuestion.js';
import type { QuestionValidator } from './validate.js';

export interface ReviewOptions {
    contentDir: string;
    contentRoot: string;
    log: (line: string) => void;
    // The oracle's observed output for a question, or undefined when it has none.
    observe?: (bankKey: string, question: Question) => Promise<string | undefined>;
    pipelineDir: string;
    validate?: QuestionValidator;
}

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

export async function review(options: ReviewOptions): Promise<ReviewResult> {
    const { contentDir, contentRoot, pipelineDir } = options;
    const validate = options.validate ?? validateQuestion;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    // The manifest is untrusted: language ids, difficulty keys, and bank paths are joined
    // into file paths below, so nothing is read or written before it validates.
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    }
    const {
        manifest: { languages },
    } = checked;
    if (languages.some(({ banks }) => Object.values(banks).some(({ access }) => access !== 'free'))) {
        await assertContentRootUsable(contentRoot, pipelineDir, contentDir);
    }
    const report = await readLatestReport(join(pipelineDir, 'reports'));
    if (report === null) {
        throw new Error('no pipeline report found: run `pipeline validate` first');
    }
    const result: ReviewResult = { approved: 0, items: 0, pending: 0, problems: 0, rejected: 0 };
    for (const { banks, id: languageId, kind } of languages) {
        for (const [difficulty, { access, path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            const bank = (await readJson(resolveBankFile(contentDir, contentRoot, { access, path }))) as {
                questions: Question[];
            };
            const outRoot = resolveBankOutputRoot(pipelineDir, contentRoot, { access });
            const oracleSource = createOracleSource(join(outRoot, 'oracles'));
            const counts = await reviewBank({
                bank: bank.questions,
                scope: kind === 'topic' ? 'disputed' : 'all',
                difficulty,
                languageId,
                log,
                observe:
                    options.observe ??
                    (async (key, question) =>
                        (await validate(question, await oracleSource(key, question.id))).observed),
                // Free output stays in the public tree; paid output goes to the private content root.
                outRoot,
                statuses: new Map(
                    report.questions.filter((each) => each.bankKey === bankKey).map(({ id, status }) => [id, status]),
                ),
            });
            for (const key of Object.keys(result) as (keyof ReviewResult)[]) {
                result[key] += counts[key];
            }
        }
    }
    return result;
}
