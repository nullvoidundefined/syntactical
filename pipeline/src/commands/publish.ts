// `pipeline publish`: merges each bank's staged topics (classify), generated questions
// (gap-fill), rationales (enrich), and review decisions into the bank files, then rebuilds
// the manifest so hashes, topic counts, and content versions update.
//
// A question is written only when its validation `passed` or a human approved it; a `failed`
// one is never written, reviewed or not (B-22). `validateBankForPublish` runs on every merged
// bank and any problem refuses that whole bank. Free banks are written under `contentDir`;
// paid banks only under `contentRoot` (the private content repo), never under `contentDir`.
// A paid bank file found under `contentDir` refuses the whole run before anything is written
// (B-60): paid banks are never public, so one there is a mistake to fix, not a source to read.
// The manifest build runs once, and only when at least one bank was written.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { validateManifest, type Manifest } from '@syntactical/content-schema';

import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { readFallbackTopics } from '../services/classify/readFallbackTopics.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { readTaxonomy } from '../services/enrich/readTaxonomy.js';
import { buildPublishContext } from '../services/publish/buildPublishContext.js';
import { buildPublishReport } from '../services/publish/buildPublishReport.js';
import { fillEmptyTopics } from '../services/publish/fillEmptyTopics.js';
import { publishBank } from '../services/publish/publishBank.js';
import { readSourceQuestions } from '../services/publish/readSourceQuestions.js';
import { readVerdicts } from '../services/publish/readVerdicts.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import type { PipelineReport } from '../types/PipelineReport.js';
import type { PublishBankResult } from '../types/publish/PublishBankResult.js';

export interface PublishOptions {
    // Rebuilds the manifest (hashes, topic counts, content versions) and the generated modules.
    buildManifest: (contentRoot: string) => Promise<void>;
    contentDir: string;
    contentRoot: string;
    log: (line: string) => void;
    newRunId: () => string;
    now: () => string;
    pipelineDir: string;
}

export interface PublishResult {
    banks: Record<string, PublishBankResult>;
    report: PipelineReport;
}

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function isFilePresent(path: string): Promise<boolean> {
    return (await stat(path).catch(() => null))?.isFile() ?? false;
}

async function assertNoPublicPaidBank(contentDir: string, languages: Manifest['languages']): Promise<void> {
    for (const { banks, id } of languages) {
        for (const [difficulty, { access, path }] of Object.entries(banks)) {
            if (access === 'paid' && (await isFilePresent(join(contentDir, path)))) {
                throw new Error(`paid bank in public content: ${id}/${difficulty}`);
            }
        }
    }
}

export async function publish(options: PublishOptions): Promise<PublishResult> {
    const { buildManifest, contentDir, contentRoot, newRunId, now, pipelineDir } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = now();
    const manifestPath = join(contentDir, 'manifest.json');
    // The manifest is untrusted: language ids and bank paths are joined into file paths below.
    const checked = validateManifest(await readJson(manifestPath));
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
    await assertNoPublicPaidBank(contentDir, languages);
    const previous = await readLatestReport(join(pipelineDir, 'reports'));
    const verdicts = readVerdicts(previous);
    const fallbackTopics = await readFallbackTopics(join(pipelineDir, 'topics.json'));
    const banks: Record<string, PublishBankResult> = {};
    for (const language of languages) {
        const { banks: entries, id: languageId } = language;
        const taxonomy = (await readTaxonomy(pipelineDir, languageId)) ?? [];
        const context = buildPublishContext(language, taxonomy, fallbackTopics[languageId]);
        for (const [difficulty, { access, path }] of Object.entries(entries)) {
            const bankKey = `${languageId}/${difficulty}`;
            const publicFile = join(contentDir, path);
            const privateFile = join(contentRoot, path);
            const isFree = access === 'free';
            banks[bankKey] = await publishBank({
                bankFile: isFree ? publicFile : privateFile,
                bankKey,
                context,
                difficulty,
                languageId,
                log,
                outRoot: isFree ? pipelineDir : contentRoot,
                reported: verdicts.get(bankKey) ?? new Map(),
                source: await readSourceQuestions([isFree ? publicFile : privateFile]),
            });
        }
    }
    const results = Object.values(banks);
    if (results.some(({ isWritten }) => isWritten)) {
        await fillEmptyTopics(manifestPath, fallbackTopics);
        await buildManifest(contentRoot);
    }
    const report = buildPublishReport(previous, results, { finishedAt: now(), runId: newRunId(), startedAt });
    await writePipelineReport(join(pipelineDir, 'reports'), report);
    return { banks, report };
}
