// `pipeline draft-taxonomy <language>`: drafts the language's misconception list and writes
// `<pipelineDir>/taxonomy/<language>.draft.json`. It never writes the approved
// `<language>.json`: the owner reviews the draft and renames it to approve it, and only the
// approved file reaches the content manifest. The model sees questions from FREE banks only
// (plus its own knowledge of the language), so no paid question text leaves the private repo.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import { writeJsonAtomic } from '../services/classify/writeJsonAtomic.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
import { draftTaxonomyList } from '../services/taxonomy/draftTaxonomyList.js';
import type { ModelProvider } from '../types/ModelProvider.js';

export interface DraftTaxonomyOptions {
    contentDir: string;
    language: string;
    log: (line: string) => void;
    pipelineDir: string;
    provider: ModelProvider;
}

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

export async function draftTaxonomy(options: DraftTaxonomyOptions): Promise<string> {
    const { contentDir, language, pipelineDir, provider } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    // The manifest is untrusted: the language id and bank paths are joined into file paths,
    // so the language must be one the validated manifest lists before any path is built.
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    }
    const entry = checked.manifest.languages.find(({ id }) => id === language);
    if (entry === undefined) {
        throw new Error(`unknown language: ${sanitizeLogText(language)}`);
    }
    const questions: Question[] = [];
    for (const { access, path } of Object.values(entry.banks)) {
        if (access === 'free') {
            questions.push(...((await readJson(join(contentDir, path))) as { questions: Question[] }).questions);
        }
    }
    const misconceptions = await draftTaxonomyList(language, questions, provider);
    const draftPath = join(pipelineDir, 'taxonomy', `${language}.draft.json`);
    await writeJsonAtomic(draftPath, misconceptions);
    log(`wrote ${misconceptions.length} misconceptions to ${draftPath}; review it, then rename it to approve`);
    return draftPath;
}
