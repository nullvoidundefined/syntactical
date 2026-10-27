// `pipeline enrich`: writes one rationale and one misconception tag per wrong choice of
// every question, conditioned on the oracle's observed output and judged against it. The
// tags come from the language's APPROVED taxonomy (`taxonomy/<language>.json`); a language
// with none is skipped with a log line. Content files are only read, never written:
// results land in `enrichment/<language>/<difficulty>.json` (question id to rationales)
// and merging them into banks is publish's job.
//
// A question with no passing oracle observation is skipped, unless `secondProvider` is set: then
// its rationales are grounded in the answer key and explanation and must pass judges on both
// providers (see enrichQuestion).
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';

import type { EnrichBankResult } from '../types/EnrichBankResult.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { OracleSource } from '../types/OracleSource.js';
import type { PipelineReport } from '../types/PipelineReport.js';
import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { readBankQuestions } from '../services/content/readBankQuestions.js';
import { buildEnrichReport } from '../services/enrich/buildEnrichReport.js';
import { createOracleSource } from '../services/createOracleSource.js';
import { enrichBank } from '../services/enrich/enrichBank.js';
import { readJsonIfPresent } from '../services/json/readJsonIfPresent.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { readTaxonomy } from '../services/enrich/readTaxonomy.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { validateQuestion } from '../services/validateQuestion.js';
import { writePipelineReport } from '../services/writePipelineReport.js';

import type { QuestionValidator } from './validate.js';

export interface EnrichOptions {
    contentDir: string;
    // Only these language ids, when given; every language otherwise.
    languages?: readonly string[];
    log: (line: string) => void;
    newRunId: () => string;
    now: () => string;
    oracleSource?: OracleSource;
    pipelineDir: string;
    provider: ModelProvider;
    secondProvider?: ModelProvider;
    validate?: QuestionValidator;
}

export async function enrich(options: EnrichOptions): Promise<PipelineReport> {
    const { contentDir, newRunId, pipelineDir, provider, secondProvider } = options;
    const validate = options.validate ?? validateQuestion;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = options.now();
    const { languages } = await loadValidatedManifest(contentDir);
    // Reports hold ids and verdicts only; every command shares one report chain in the pipeline dir.
    const reportsDir = join(pipelineDir, 'reports');
    const previous = await readLatestReport(reportsDir);
    const totals: EnrichBankResult = { accepted: 0, agreed: 0, compared: 0, contradicted: 0, dropped: 0 };
    for (const { banks, id: languageId } of languages) {
        if (options.languages !== undefined && !options.languages.includes(languageId)) continue;
        const taxonomy = await readTaxonomy(pipelineDir, languageId);
        if (taxonomy === null) {
            log(`skipping language ${languageId}: no approved taxonomy`);
            continue;
        }
        for (const [difficulty, { path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            const questions = await readBankQuestions(join(contentDir, path));
            const oracleSource = options.oracleSource ?? createOracleSource(join(pipelineDir, 'oracles'));
            const staged = (await readJsonIfPresent(
                join(pipelineDir, 'generated', languageId, `${difficulty}.json`),
            )) as { questions: Question[] } | undefined;
            const result = await enrichBank({
                bankKey,
                difficulty,
                languageId,
                log,
                observe: async (question) => {
                    const { observed, status } = await validate(question, await oracleSource(bankKey, question.id));
                    return status === 'passed' ? observed : undefined;
                },
                outRoot: pipelineDir,
                provider,
                // Publish keeps the staged file, so a published question can sit in both lists.
                questions: [
                    ...questions,
                    ...(staged?.questions ?? []).filter(({ id }) => !questions.some((question) => question.id === id)),
                ],
                secondProvider,
                taxonomy,
            });
            const { accepted, agreed, compared, contradicted, dropped } = result;
            totals.accepted += accepted;
            totals.agreed += agreed;
            totals.compared += compared;
            totals.contradicted += contradicted;
            totals.dropped += dropped;
        }
    }
    const report = buildEnrichReport(previous, totals, {
        finishedAt: options.now(),
        runId: newRunId(),
        startedAt,
    });
    await writePipelineReport(reportsDir, report);
    return report;
}
