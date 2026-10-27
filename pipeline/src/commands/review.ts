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
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';

import type { ReviewResult } from '../types/review/ReviewResult.js';
import { listBankEntries } from '../services/content/listBankEntries.js';
import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { readBankQuestions } from '../services/content/readBankQuestions.js';
import { createOracleSource } from '../services/createOracleSource.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { reviewBank } from '../services/review/reviewBank.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';

import { validateQuestion } from '../services/validateQuestion.js';
import type { QuestionValidator } from './validate.js';

export interface ReviewOptions {
    contentDir: string;
    log: (line: string) => void;
    // The oracle's observed output for a question, or undefined when it has none.
    observe?: (bankKey: string, question: Question) => Promise<string | undefined>;
    pipelineDir: string;
    validate?: QuestionValidator;
}

export async function review(options: ReviewOptions): Promise<ReviewResult> {
    const { contentDir, pipelineDir } = options;
    const validate = options.validate ?? validateQuestion;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const manifest = await loadValidatedManifest(contentDir);
    const report = await readLatestReport(join(pipelineDir, 'reports'));
    if (report === null) {
        throw new Error('no pipeline report found: run `pipeline validate` first');
    }
    const result: ReviewResult = { approved: 0, items: 0, pending: 0, problems: 0, rejected: 0 };
    for (const { bankKey, difficulty, entry, languageId } of listBankEntries(manifest)) {
        const oracleSource = createOracleSource(join(pipelineDir, 'oracles'));
        const counts = await reviewBank({
            bank: await readBankQuestions(join(contentDir, entry.path)),
            difficulty,
            languageId,
            log,
            observe:
                options.observe ??
                (async (key, question) => (await validate(question, await oracleSource(key, question.id))).observed),
            outRoot: pipelineDir,
            statuses: new Map(
                report.questions.filter((each) => each.bankKey === bankKey).map(({ id, status }) => [id, status]),
            ),
        });
        for (const key of Object.keys(result) as (keyof ReviewResult)[]) {
            result[key] += counts[key];
        }
    }
    return result;
}
