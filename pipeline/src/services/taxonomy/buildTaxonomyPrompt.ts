// Fills the taxonomy prompt template. Each question is untrusted data (JSON, `<` escaped)
// and sits only inside the data tags; the language id comes from the validated manifest.
import { readFile } from 'node:fs/promises';

import { CONTENT_LIMITS, type Question } from '@syntactical/content-schema';

import { serializeQuestionData } from '../serializeQuestionData.js';

const TEMPLATE_URL = new URL('../../../prompts/draftTaxonomy.md', import.meta.url);

const { maxMisconceptions, misconceptionDescriptionLength } = CONTENT_LIMITS;

export async function buildTaxonomyPrompt(language: string, questions: readonly Question[]): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    // One line per question so the data block stays one JSON object per line.
    const data = questions.map((question) => serializeQuestionData(question).replaceAll(/\s*\n\s*/g, ' ')).join('\n');
    return template
        .replaceAll('{{LANGUAGE}}', () => language)
        .replaceAll('{{MAX}}', () => String(maxMisconceptions))
        .replaceAll('{{DESCRIPTION_LENGTH}}', () => String(misconceptionDescriptionLength))
        .replace('{{QUESTION_DATA}}', () => data);
}
