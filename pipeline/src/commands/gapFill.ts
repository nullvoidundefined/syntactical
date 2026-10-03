// `pipeline gap-fill`: tops up every topic that has fewer than TARGET_QUESTIONS_PER_TOPIC
// questions with model-generated questions, each kept only when its claimed answer matches
// its executed oracle. Generated code runs only through the sandboxed `runOracle`.
// Content bank files are only read, never written: kept questions are staged in
// `generated/<language>/<difficulty>.json` and publish moves them into banks.
//
// Free-bank output goes under the public `pipelineDir`. Paid-bank output goes under
// `contentRoot` (the private content repo); nothing paid is ever written under `pipelineDir`.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import type { runOracle } from '../clients/dockerRunner.js';
import { ORACLE_LANGUAGES } from '../services/ORACLE_LANGUAGES.js';
import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { pickTopics } from '../services/classify/pickTopics.js';
import { readFallbackTopics } from '../services/classify/readFallbackTopics.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { fillBank } from '../services/gapFill/fillBank.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import type { FillBankResult } from '../types/FillBankResult.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { PipelineReport } from '../types/PipelineReport.js';

export interface GapFillOptions {
    contentDir: string;
    contentRoot: string;
    log: (line: string) => void;
    newRunId: () => string;
    now: () => string;
    pipelineDir: string;
    provider: ModelProvider;
    run?: typeof runOracle;
}

const STAGE = 'gap-fill';

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

function buildReport(
    previous: PipelineReport | null,
    totals: FillBankResult,
    meta: Pick<PipelineReport, 'finishedAt' | 'runId' | 'startedAt'>,
): PipelineReport {
    const { counts, questions } = previous ?? { counts: {}, questions: [] };
    const { duplicate, failed, generated } = totals;
    return {
        ...meta,
        counts: {
            ...counts,
            'gap-fill-duplicate': duplicate,
            'gap-fill-failed': failed,
            'gap-fill-generated': generated,
        },
        questions,
        stage: STAGE,
        ...(previous?.agreement === undefined ? {} : { agreement: previous.agreement }),
    };
}

export async function gapFill(options: GapFillOptions): Promise<PipelineReport> {
    const { contentDir, contentRoot, newRunId, pipelineDir, provider, run } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = options.now();
    // The manifest is untrusted: language ids, difficulty keys, and bank paths are joined
    // into file paths below, so nothing is read or written before it validates.
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    }
    const { manifest } = checked;
    const { languages } = manifest;
    if (languages.some(({ banks }) => Object.values(banks).some(({ access }) => access !== 'free'))) {
        await assertContentRootUsable(contentRoot, pipelineDir, contentDir);
    }
    const fallbackTopics = await readFallbackTopics(join(pipelineDir, 'topics.json'));
    const previous = await readLatestReport(join(pipelineDir, 'reports'));
    const totals: FillBankResult = { duplicate: 0, failed: 0, generated: 0 };
    const reportsDir = join(pipelineDir, 'reports');
    let isCompleted = false;
    let report: PipelineReport;
    try {
        for (const { banks, id: languageId, topics: manifestTopics } of languages) {
            const language = Object.hasOwn(ORACLE_LANGUAGES, languageId) ? ORACLE_LANGUAGES[languageId] : undefined;
            const topics = pickTopics(
                manifestTopics,
                Object.hasOwn(fallbackTopics, languageId) ? fallbackTopics[languageId] : undefined,
            );
            for (const [difficulty, { access, path }] of Object.entries(banks)) {
                const bankKey = `${languageId}/${difficulty}`;
                if (!language || topics.length === 0) {
                    log(`skipping bank ${bankKey}: no oracle runner or topic list for language ${languageId}`);
                    continue;
                }
                const bank = (await readJson(join(contentDir, path))) as { questions: Question[] };
                const result = await fillBank({
                    bankKey,
                    difficulty,
                    language,
                    languageId,
                    log,
                    // Free output stays in the public tree; paid output goes to the private content root.
                    outRoot: access === 'free' ? pipelineDir : contentRoot,
                    provider,
                    questions: bank.questions,
                    topics,
                    ...(run === undefined ? {} : { run }),
                });
                const { duplicate, failed, generated } = result;
                totals.duplicate += duplicate;
                totals.failed += failed;
                totals.generated += generated;
            }
        }
        isCompleted = true;
    } finally {
        // A later bank that throws must not lose the counts of the banks already filled.
        report = buildReport(previous, totals, { finishedAt: options.now(), runId: newRunId(), startedAt });
        if (isCompleted) {
            await writePipelineReport(reportsDir, report);
        } else {
            try {
                await writePipelineReport(reportsDir, report);
            } catch (writeError) {
                log(`could not write the partial report (${String(writeError)})`);
            }
        }
    }
    return report;
}
