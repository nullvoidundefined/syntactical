// Fills the generate-question prompt template. Existing prompts and the notes (observed
// program output, rejection reasons) are untrusted data: they go in as JSON inside data
// tags with `<` escaped, so no text can close a tag and smuggle text outside it.
import { readFile } from 'node:fs/promises';

import type { GenerateQuestionArgs } from '../../types/GenerateQuestionArgs.js';

const TEMPLATE_URL = new URL('../../../prompts/generateQuestion.md', import.meta.url);

const JSON_INDENT = 2;
const MAX_EXISTING_PROMPTS = 100;

function asData(value: unknown): string {
    return JSON.stringify(value, null, JSON_INDENT).replaceAll('<', '\\u003c');
}

export async function buildGeneratePrompt(
    args: Pick<GenerateQuestionArgs, 'difficulty' | 'existingPrompts' | 'language' | 'languageId' | 'topic'>,
    notes: string[],
): Promise<string> {
    const { difficulty, existingPrompts, language, languageId, topic } = args;
    const template = await readFile(TEMPLATE_URL, 'utf8');
    const values: Record<string, string> = {
        DIFFICULTY: difficulty,
        EXISTING_PROMPTS: asData([...existingPrompts].slice(0, MAX_EXISTING_PROMPTS)),
        LANGUAGE: language,
        LANGUAGE_ID: languageId,
        NOTES: asData(notes),
        TOPIC: topic,
    };
    // One pass over the template: inserted text is never scanned for placeholders again.
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
        Object.hasOwn(values, key) ? (values[key] as string) : match,
    );
}
