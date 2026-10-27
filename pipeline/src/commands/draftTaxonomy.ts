// `pipeline draft-taxonomy <language>`: drafts the language's misconception list and writes
// `<pipelineDir>/taxonomy/<language>.draft.json`. It never writes the approved
// `<language>.json`: the owner reviews the draft and renames it to approve it, and only the
// approved file reaches the content manifest. The model sees the questions of every bank of the language
// (plus its own knowledge of it).
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';

import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { readBankQuestions } from '../services/content/readBankQuestions.js';
import { writeJsonAtomic } from '../services/json/writeJsonAtomic.js';
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

export async function draftTaxonomy(options: DraftTaxonomyOptions): Promise<string> {
    const { contentDir, language, pipelineDir, provider } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    // The manifest is untrusted: the language id and bank paths are joined into file paths,
    // so the language must be one the validated manifest lists before any path is built.
    const manifest = await loadValidatedManifest(contentDir);
    const entry = manifest.languages.find(({ id }) => id === language);
    if (entry === undefined) {
        throw new Error(`unknown language: ${sanitizeLogText(language)}`);
    }
    const questions: Question[] = [];
    for (const { path } of Object.values(entry.banks)) {
        questions.push(...(await readBankQuestions(join(contentDir, path))));
    }
    const misconceptions = await draftTaxonomyList(language, questions, provider);
    const draftPath = join(pipelineDir, 'taxonomy', `${language}.draft.json`);
    await writeJsonAtomic(draftPath, misconceptions);
    log(`wrote ${misconceptions.length} misconceptions to ${draftPath}; review it, then rename it to approve`);
    return draftPath;
}
