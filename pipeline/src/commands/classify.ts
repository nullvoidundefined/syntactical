// `pipeline classify`: assigns each question one topic from its language's closed list.
// Every question is classified twice (two independent model calls); their agreement rate
// goes in the pipeline report as `agreement.classify`. A question whose two runs disagree,
// or whose confidence is below CLASSIFY_CONFIDENCE_MIN, gets a review-queue file instead of
// a topic. Content files are only read, never written: accepted topics land in
// `classifications/<language>/<difficulty>.json` (question id to topic), and assigning them
// into banks is publish's job.
//
// Free-bank output goes under the public `pipelineDir`. Paid-bank output goes under
// `contentRoot` (the private content repo) and carries ids and topics only; no paid
// question text is written anywhere, and nothing paid is ever written under `pipelineDir`.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { classifyBank } from '../services/classify/classifyBank.js';
import { pickTopics } from '../services/classify/pickTopics.js';
import { readFallbackTopics } from '../services/classify/readFallbackTopics.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import { resolveBankFile } from '../services/resolveBankFile.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { PipelineReport } from '../types/PipelineReport.js';

export interface ClassifyOptions {
    contentDir: string;
    contentRoot: string;
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

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

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
    const { contentDir, contentRoot, newRunId, pipelineDir, provider } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = options.now();
    // The manifest is untrusted: language ids, difficulty keys, and bank paths are joined
    // into file paths below, so nothing is read, queued, or written before it validates.
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
    const totals: Totals = { accepted: 0, agreed: 0, compared: 0, queued: 0 };
    const flags: string[] = [];
    for (const { banks, id: languageId, topics: manifestTopics } of languages) {
        const topics = pickTopics(
            manifestTopics,
            Object.hasOwn(fallbackTopics, languageId) ? fallbackTopics[languageId] : undefined,
        );
        for (const [difficulty, { access, path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            if (topics.length === 0) {
                log(`skipping bank ${bankKey}: no topic list for language ${languageId}`);
                continue;
            }
            const bank = (await readJson(resolveBankFile(contentDir, contentRoot, { access, path }))) as {
                questions: Question[];
            };
            const result = await classifyBank({
                bankKey,
                difficulty,
                languageId,
                log,
                // Free output stays in the public tree; paid output goes to the private content root.
                outRoot: access === 'free' ? pipelineDir : contentRoot,
                provider,
                questions: bank.questions,
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
