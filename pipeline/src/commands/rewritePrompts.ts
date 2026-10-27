import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { z } from 'zod';

import { listBankEntries } from '../services/content/listBankEntries.js';
import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { rewritePrompts as rewriteBankPrompts } from '../services/gapFill/rewritePrompts.js';
import { writeJsonAtomic } from '../services/json/writeJsonAtomic.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import type { ModelProvider } from '../types/ModelProvider.js';

const stagedSchema = z.looseObject({
    questions: z.array(z.looseObject({ id: z.string(), prompt: z.string(), type: z.string() })),
});

export async function rewritePrompts({
    contentDir,
    log,
    pipelineDir,
    provider,
}: {
    contentDir: string;
    log: (line: string) => void;
    pipelineDir: string;
    provider: ModelProvider;
}): Promise<void> {
    const manifest = await loadValidatedManifest(contentDir);
    const stagedBanks: {
        difficulty: string;
        file: string;
        languageId: string;
        staged: z.infer<typeof stagedSchema>;
    }[] = [];
    for (const { bankKey, difficulty, languageId } of listBankEntries(manifest)) {
        const root = pipelineDir;
        const file = join(root, 'generated', languageId, `${difficulty}.json`);
        let text: string;
        try {
            text = await readFile(file, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(
                    `Cannot read staged file: ${sanitizeLogText(relative(join(root, 'generated'), file))}`,
                    {
                        cause: error,
                    },
                );
            }
            log(sanitizeLogText(`${bankKey}: 0 rewritten (no staged file)`));
            continue;
        }
        try {
            const staged = stagedSchema.parse(JSON.parse(text));
            stagedBanks.push({ difficulty, file, languageId, staged });
        } catch (error) {
            throw new Error(`Invalid staged file: ${sanitizeLogText(relative(join(root, 'generated'), file))}`, {
                cause: error,
            });
        }
    }
    // A provider error stops the run with earlier banks already written atomically; rerunning is safe.
    for (const { difficulty, file, languageId, staged } of stagedBanks) {
        const result = await rewriteBankPrompts({
            difficulty,
            languageId,
            provider,
            questions: staged.questions as Question[],
        });
        await writeJsonAtomic(file, { ...staged, questions: result.questions });
        log(sanitizeLogText(`${languageId}/${difficulty}: ${result.rewritten} rewritten`));
    }
}
