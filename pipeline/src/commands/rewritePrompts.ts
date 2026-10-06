import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';
import { z } from 'zod';

import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { rewritePrompts as rewriteBankPrompts } from '../services/gapFill/rewritePrompts.js';
import { resolveBankOutputRoot } from '../services/resolveBankOutputRoot.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writeFileAtomic } from '../services/writeFileAtomic.js';
import type { ModelProvider } from '../types/ModelProvider.js';

const stagedSchema = z.looseObject({
    questions: z.array(z.looseObject({ id: z.string(), prompt: z.string(), type: z.string() })),
});

export async function rewritePrompts({
    contentDir,
    contentRoot,
    log,
    pipelineDir,
    provider,
}: {
    contentDir: string;
    contentRoot: string;
    log: (line: string) => void;
    pipelineDir: string;
    provider: ModelProvider;
}): Promise<void> {
    const checked = validateManifest(JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8')));
    if ('rule' in checked) throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    const { languages } = checked.manifest;
    if (languages.some(({ banks }) => Object.values(banks).some(({ access }) => access !== 'free'))) {
        try {
            await assertContentRootUsable(contentRoot, pipelineDir, contentDir);
        } catch (error) {
            throw new Error(`content root check failed: ${sanitizeLogText(String(error))}`, { cause: error });
        }
    }
    const stagedBanks: {
        difficulty: string;
        file: string;
        languageId: string;
        staged: z.infer<typeof stagedSchema>;
    }[] = [];
    for (const { banks, id: languageId } of languages) {
        for (const [difficulty, bank] of Object.entries(banks)) {
            const root = resolveBankOutputRoot(pipelineDir, contentRoot, bank);
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
                log(sanitizeLogText(`${languageId}/${difficulty}: 0 rewritten (no staged file)`));
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
    }
    // A provider error stops the run with earlier banks already written atomically; rerunning is safe.
    for (const { difficulty, file, languageId, staged } of stagedBanks) {
        const result = await rewriteBankPrompts({
            difficulty,
            languageId,
            provider,
            questions: staged.questions as Question[],
        });
        await writeFileAtomic(file, `${JSON.stringify({ ...staged, questions: result.questions }, null, 2)}\n`);
        log(sanitizeLogText(`${languageId}/${difficulty}: ${result.rewritten} rewritten`));
    }
}
