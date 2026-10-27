// `pipeline classify`: assigns each question one topic from its language's closed list.
// Every question is classified twice (two independent model calls); their agreement rate
// goes in the pipeline report as `agreement.classify`. A question whose two runs disagree,
// or whose confidence is below CLASSIFY_CONFIDENCE_MIN, gets a review-queue file instead of
// a topic. Content files are only read, never written: accepted topics land in
// `classifications/<language>/<difficulty>.json` (question id to topic), and assigning them
// into banks is publish's job.
import { join } from 'node:path';

import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { readBankQuestions } from '../services/content/readBankQuestions.js';
import { classifyBank } from '../services/classify/classifyBank.js';
import { pickTopics } from '../services/classify/pickTopics.js';
import { readFallbackTopics } from '../services/classify/readFallbackTopics.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { PipelineReport } from '../types/PipelineReport.js';

export interface ClassifyOptions {
    contentDir: string;
    log: (line: string) => void;
    newRunId: () => string;
    now: () => string;
    pipelineDir: string;
    provider: ModelProvider;
}

interface Totals {
    accepted: number;
    agreed: number;
    compared: number;
    queued: number;
}

const STAGE = 'classify';

function buildReport(
    previous: PipelineReport | null,
    totals: Totals,
    flags: string[],
    meta: Pick<PipelineReport, 'finishedAt' | 'runId' | 'startedAt'>,
): PipelineReport {
    const { accepted, agreed, compared, queued } = totals;
    const { agreement, counts, questions } = previous ?? {
        counts: {},
        questions: [],
    };
    const hasAgreement = compared > 0 || agreement !== undefined;
    return {
        ...meta,
        counts: {
            ...counts,
            'classify-accepted': accepted,
            'classify-review': queued,
        },
        questions,
        stage: STAGE,
        ...(flags.length > 0 ? { flags } : {}),
        ...(hasAgreement
            ? {
                  agreement: {
                      ...agreement,
                      ...(compared > 0 ? { classify: agreed / compared } : {}),
                  },
              }
            : {}),
    };
}

export async function classify(options: ClassifyOptions): Promise<PipelineReport> {
    const { contentDir, newRunId, pipelineDir, provider } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = options.now();
    const { languages } = await loadValidatedManifest(contentDir);
    const fallbackTopics = await readFallbackTopics(join(pipelineDir, 'topics.json'));
    const previous = await readLatestReport(join(pipelineDir, 'reports'));
    const totals: Totals = { accepted: 0, agreed: 0, compared: 0, queued: 0 };
    const flags: string[] = [];
    for (const { banks, id: languageId, topics: manifestTopics } of languages) {
        const topics = pickTopics(
            manifestTopics,
            Object.hasOwn(fallbackTopics, languageId) ? fallbackTopics[languageId] : undefined,
        );
        for (const [difficulty, { path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            if (topics.length === 0) {
                log(`skipping bank ${bankKey}: no topic list for language ${languageId}`);
                continue;
            }
            const questions = await readBankQuestions(join(contentDir, path));
            const result = await classifyBank({
                bankKey,
                difficulty,
                languageId,
                log,
                outRoot: pipelineDir,
                provider,
                questions,
                topics,
            });
            const { accepted, agreed, compared, isWtfOveruse, queued } = result;
            totals.accepted += accepted;
            totals.agreed += agreed;
            totals.compared += compared;
            totals.queued += queued;
            if (isWtfOveruse) {
                flags.push(`${bankKey}: wtf-overuse`);
                log(`${bankKey}: flagged wtf-overuse`);
            }
        }
    }
    const report = buildReport(previous, totals, flags, {
        finishedAt: options.now(),
        runId: newRunId(),
        startedAt,
    });
    await writePipelineReport(join(pipelineDir, 'reports'), report);
    return report;
}
