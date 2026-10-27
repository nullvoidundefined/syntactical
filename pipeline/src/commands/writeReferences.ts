// `pipeline write-references`: writes a before-answer reference (a neutral title, a syntax reference with
// examples, and documentation links) for every question in every bank, and saves each accepted one at once to
// `<pipelineDir>/references/<language>/<difficulty>.json` (question id to reference), so a rerun skips questions
// already done. A reference that judges on both providers do not clear as answer-free is not saved. Content files
// are only read; apply-staging merges the references, keeping only the links `verify-doc-links` confirmed.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import type { ModelProvider } from '../types/ModelProvider.js';
import { ProviderTransientError } from '../types/ProviderTransientError.js';
import { ModelOutputInvalid } from '../types/ModelOutputInvalid.js';
import { writeJsonAtomic } from '../services/json/writeJsonAtomic.js';
import { DOC_HOSTS } from '../services/references/DOC_HOSTS.js';
import { readReferences } from '../services/references/readReferences.js';
import { referenceQuestion } from '../services/references/referenceQuestion.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';

export interface WriteReferencesOptions {
    contentDir: string;
    // Only these language ids, when given; every language otherwise.
    languages?: readonly string[];
    log: (line: string) => void;
    pipelineDir: string;
    provider: ModelProvider;
    secondProvider: ModelProvider;
}

export interface WriteReferencesResult {
    accepted: number;
    revealedAnswer: number;
    skipped: number;
}

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeReferences(options: WriteReferencesOptions): Promise<WriteReferencesResult> {
    const { contentDir, pipelineDir, provider, secondProvider } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    // The manifest is untrusted: ids and paths are joined into file paths only after it validates.
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    }
    const result: WriteReferencesResult = { accepted: 0, revealedAnswer: 0, skipped: 0 };
    for (const { banks, grammar, id: languageId, label } of checked.manifest.languages) {
        if (options.languages !== undefined && !options.languages.includes(languageId)) continue;
        const hosts = DOC_HOSTS[languageId];
        if (hosts === undefined) {
            log(`skipping language ${languageId}: no documentation hosts listed`);
            continue;
        }
        const track = { grammar, hosts, label };
        for (const [difficulty, { path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            const file = join(pipelineDir, 'references', languageId, `${difficulty}.json`);
            const saved = await readReferences(file);
            const { questions } = (await readJson(join(contentDir, path))) as { questions: Question[] };
            for (const question of questions) {
                const { id } = question;
                if (saved.has(id)) continue;
                let outcome;
                try {
                    outcome = await referenceQuestion(question, track, { provider, secondProvider });
                } catch (error) {
                    if (error instanceof ProviderTransientError || error instanceof ModelOutputInvalid) {
                        log(
                            `${bankKey} ${id}: skipped, ${error instanceof ProviderTransientError ? error.reason : 'model-output-invalid'}`,
                        );
                        result.skipped += 1;
                        continue;
                    }
                    throw error;
                }
                if (outcome.status === 'reveals-answer') {
                    log(
                        `${bankKey} ${id}: not saved, the reference reveals the answer (${outcome.reasons.join('; ')})`,
                    );
                    result.revealedAnswer += 1;
                    continue;
                }
                saved.set(id, outcome.reference);
                await writeJsonAtomic(file, Object.fromEntries(saved));
                result.accepted += 1;
            }
            log(`${bankKey}: ${saved.size} of ${questions.length} questions have a reference`);
        }
    }
    return result;
}
