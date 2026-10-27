// `pipeline publish`: merges each bank's staged topics (classify), generated questions
// (gap-fill), rationales (enrich), and review decisions into the bank files, then rebuilds
// the manifest so hashes, topic counts, and content versions update.
//
// A question is written only when its validation `passed` or a human approved it; a `failed`
// one is never written, reviewed or not (B-22). `validateBankForPublish` runs on every merged
// bank and any problem refuses that whole bank. Every bank is written under `contentDir`, and its staging is read
// from `pipelineDir`.
// The manifest build runs once, and only when at least one bank was written.
import { join } from 'node:path';

import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { readBankQuestions } from '../services/content/readBankQuestions.js';
import { readFallbackTopics } from '../services/classify/readFallbackTopics.js';
import { readLatestReport } from '../services/classify/readLatestReport.js';
import { readTaxonomy } from '../services/enrich/readTaxonomy.js';
import { buildPublishContext } from '../services/publish/buildPublishContext.js';
import { buildPublishReport } from '../services/publish/buildPublishReport.js';
import { fillEmptyTopics } from '../services/publish/fillEmptyTopics.js';
import { publishBank } from '../services/publish/publishBank.js';
import { readVerdicts } from '../services/publish/readVerdicts.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import type { PipelineReport } from '../types/PipelineReport.js';
import type { PublishBankResult } from '../types/publish/PublishBankResult.js';

export interface PublishOptions {
    // Rebuilds the manifest (hashes, topic counts, content versions) and the generated modules.
    buildManifest: () => Promise<void>;
    contentDir: string;
    log: (line: string) => void;
    newRunId: () => string;
    now: () => string;
    pipelineDir: string;
}

export interface PublishResult {
    banks: Record<string, PublishBankResult>;
    report: PipelineReport;
}

export async function publish(options: PublishOptions): Promise<PublishResult> {
    const { buildManifest, contentDir, newRunId, now, pipelineDir } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const startedAt = now();
    const manifestPath = join(contentDir, 'manifest.json');
    const manifest = await loadValidatedManifest(contentDir);
    const previous = await readLatestReport(join(pipelineDir, 'reports'));
    const verdicts = readVerdicts(previous);
    const fallbackTopics = await readFallbackTopics(join(pipelineDir, 'topics.json'));
    const banks: Record<string, PublishBankResult> = {};
    for (const language of manifest.languages) {
        const { banks: entries, id: languageId } = language;
        const taxonomy = (await readTaxonomy(pipelineDir, languageId)) ?? [];
        const context = buildPublishContext(language, taxonomy, fallbackTopics[languageId]);
        for (const [difficulty, entry] of Object.entries(entries)) {
            const bankKey = `${languageId}/${difficulty}`;
            const bankFile = join(contentDir, entry.path);
            banks[bankKey] = await publishBank({
                bankFile,
                bankKey,
                context,
                difficulty,
                languageId,
                log,
                outRoot: pipelineDir,
                reported: verdicts.get(bankKey) ?? new Map(),
                source: await readBankQuestions(bankFile),
            });
        }
    }
    const results = Object.values(banks);
    if (results.some(({ isWritten }) => isWritten)) {
        await fillEmptyTopics(manifestPath, fallbackTopics);
        await buildManifest();
    }
    const report = buildPublishReport(previous, results, { finishedAt: now(), runId: newRunId(), startedAt });
    await writePipelineReport(join(pipelineDir, 'reports'), report);
    return { banks, report };
}
