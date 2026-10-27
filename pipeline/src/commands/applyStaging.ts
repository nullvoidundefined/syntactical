// `pipeline apply-staging`: merges staged enrichment (rationales and misconception tags) and staged references
// into every bank's existing questions, in place. Unlike publish it never adds, drops, or re-decides a question,
// so hand-written banks whose questions are not validated keep every question; it only fills fields. Content
// validation runs afterwards in the manifest build (`buildManifest`), which also lists the misconceptions the
// banks now link.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import { applyStaging as applyStagedQuestion } from '../services/publish/applyStaging.js';
import { readEnrichment } from '../services/enrich/readEnrichment.js';
import { applyReference } from '../services/references/applyReference.js';
import { readDocLinkChecks } from '../services/references/readDocLinkChecks.js';
import { readReferences } from '../services/references/readReferences.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writeFileAtomic } from '../services/writeFileAtomic.js';

export interface ApplyStagingOptions {
    buildManifest: () => Promise<void>;
    contentDir: string;
    log: (line: string) => void;
    pipelineDir: string;
}

const JSON_INDENT = 2;

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

export async function applyStaging(options: ApplyStagingOptions): Promise<{ references: number; rationales: number }> {
    const { buildManifest, contentDir, pipelineDir } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    }
    const checks = await readDocLinkChecks(join(pipelineDir, 'references', 'doc-links.json'));
    const tally = { references: 0, rationales: 0 };
    for (const { banks, id: languageId } of checked.manifest.languages) {
        for (const [difficulty, { path }] of Object.entries(banks)) {
            const enrichment = await readEnrichment(join(pipelineDir, 'enrichment', languageId, `${difficulty}.json`));
            const references = await readReferences(join(pipelineDir, 'references', languageId, `${difficulty}.json`));
            if (enrichment.size === 0 && references.size === 0) continue;
            const file = join(contentDir, path);
            const bank = (await readJson(file)) as { questions: Question[]; schemaVersion: number };
            const questions = bank.questions.map((question) => {
                const enriched = enrichment.get(question.id);
                const reference = references.get(question.id);
                tally.rationales += enriched?.length ?? 0;
                tally.references += reference === undefined ? 0 : 1;
                const merged = applyStagedQuestion(question, undefined, enriched);
                return reference === undefined ? merged : applyReference(merged, reference, checks);
            });
            await writeFileAtomic(file, `${JSON.stringify({ ...bank, questions }, null, JSON_INDENT)}\n`);
            log(
                `${languageId}/${difficulty}: applied ${enrichment.size} enrichments and ${references.size} references`,
            );
        }
    }
    await buildManifest();
    return tally;
}
