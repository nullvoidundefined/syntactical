import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import { assertContentRootUsable } from '../services/classify/assertContentRootUsable.js';
import { rewritePrompts as rewriteBankPrompts } from '../services/gapFill/rewritePrompts.js';
import { resolveBankOutputRoot } from '../services/resolveBankOutputRoot.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { writeFileAtomic } from '../services/writeFileAtomic.js';
import type { ModelProvider } from '../types/ModelProvider.js';

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
    for (const { banks, id: languageId } of languages) {
        for (const [difficulty, bank] of Object.entries(banks)) {
            const root = resolveBankOutputRoot(pipelineDir, contentRoot, bank);
            const file = join(root, 'generated', languageId, `${difficulty}.json`);
            let text: string;
            try {
                text = await readFile(file, 'utf8');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                log(sanitizeLogText(`${languageId}/${difficulty}: 0 rewritten (no staged file)`));
                continue;
            }
            const staged = JSON.parse(text) as { questions: Question[]; [key: string]: unknown };
            const result = await rewriteBankPrompts({ difficulty, languageId, provider, questions: staged.questions });
            await writeFileAtomic(file, `${JSON.stringify({ ...staged, questions: result.questions }, null, 2)}\n`);
            log(sanitizeLogText(`${languageId}/${difficulty}: ${result.rewritten} rewritten`));
        }
    }
}
