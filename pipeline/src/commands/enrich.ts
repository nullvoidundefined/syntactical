// `pipeline enrich`: writes one rationale and one misconception tag per wrong choice of
// every question, conditioned on the oracle's observed output and judged against it. The
// tags come from the language's APPROVED taxonomy (`taxonomy/<language>.json`); a language
// with none is skipped with a log line. Content files are only read, never written:
// results land in `enrichment/<language>/<difficulty>.json` (question id to rationales)
// and merging them into banks is publish's job.
//
// Free-bank output goes under the public `pipelineDir`. Paid-bank output carries paid
// question ids and rationale text, so it goes under `contentRoot` (the private content
// repo), and nothing paid is ever written under `pipelineDir` or the content dir.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { buildEnrichReport } from '../services/enrich/buildEnrichReport.js';
import { enrichBank } from '../services/enrich/enrichBank.js';
import { readTaxonomy } from '../services/enrich/readTaxonomy.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { validateQuestion } from '../services/validateQuestion.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import type { EnrichBankResult } from '../types/EnrichBankResult.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { OracleSource } from '../types/OracleSource.js';
import type { PipelineReport } from '../types/PipelineReport.js';

import type { QuestionValidator } from './validate.js';

export interface EnrichOptions {
    contentDir: string;
    contentRoot: string;
    log: (line: string) => void;
    newRunId: () => string;
    now: () => string;
    oracleSource: OracleSource;
    pipelineDir: string;
    provider: ModelProvider;
    validate?: QuestionValidator;
}

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

export async function enrich(options: EnrichOptions): Promise<PipelineReport> {
    const { contentDir, contentRoot, newRunId, oracleSource, pipelineDir, provider } = options;
    const validate = options.validate ?? validateQuestion;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = options.now();
    // The manifest is untrusted: language ids, difficulty keys, and bank paths are joined
    // into file paths below, so nothing is read or written before it validates.
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        const { rule } = checked;
        throw new Error(`Manifest rejected: ${sanitizeLogText(rule)}`);
    }
    const {
        manifest: { languages },
    } = checked;
    if (languages.some(({ banks }) => Object.values(banks).some(({ access }) => access !== 'free'))) {
        await assertContentRootUsable(contentRoot, pipelineDir, contentDir);
    }
    const previous = await readLatestReport(join(pipelineDir, 'reports'));
    const totals: EnrichBankResult = { accepted: 0, agreed: 0, compared: 0, contradicted: 0, dropped: 0 };
    for (const { banks, id: languageId } of languages) {
        const taxonomy = await readTaxonomy(pipelineDir, languageId);
        if (taxonomy === null) {
            log(`skipping language ${languageId}: no approved taxonomy`);
            continue;
        }
        for (const [difficulty, { access, path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            const bank = (await readJson(join(contentDir, path))) as { questions: Question[] };
            const result = await enrichBank({
                bankKey,
                difficulty,
                languageId,
                log,
                observe: async (question) => {
                    const { observed, status } = await validate(question, await oracleSource(bankKey, question.id));
                    return status === 'passed' ? observed : undefined;
                },
                // Free output stays in the public tree; paid output goes to the private content root.
                outRoot: access === 'free' ? pipelineDir : contentRoot,
                provider,
                questions: bank.questions,
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
    await writePipelineReport(join(pipelineDir, 'reports'), report);
    return report;
}
