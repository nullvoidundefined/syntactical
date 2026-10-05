// Fills the security generation prompt. Existing prompts and notes are untrusted data: they go in
// as JSON inside data tags with `<` escaped, and fillTemplate never rescans inserted text.
import { readFile } from 'node:fs/promises';

import type { GenerateTopicQuestionArgs } from '../../types/GenerateTopicQuestionArgs.js';
import { escapeForPrompt } from '../enrich/escapeForPrompt.js';
import { fillTemplate } from '../enrich/fillTemplate.js';

const TEMPLATE_URL = new URL('../../../prompts/generateSecurityQuestion.md', import.meta.url);
const JSON_INDENT = 2;
const MAX_EXISTING_PROMPTS = 100;

function asData(value: unknown): string {
    return escapeForPrompt(JSON.stringify(value, null, JSON_INDENT));
}

export async function buildTopicGeneratePrompt(
    args: Pick<GenerateTopicQuestionArgs, 'difficulty' | 'existingPrompts' | 'languageId' | 'runners' | 'topic'>,
    notes: string[],
): Promise<string> {
    const { difficulty, existingPrompts, languageId, runners, topic } = args;
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return fillTemplate(template, {
        DIFFICULTY: difficulty,
        EXISTING_PROMPTS: asData([...existingPrompts].slice(0, MAX_EXISTING_PROMPTS)),
        LANGUAGE: languageId,
        LANGUAGE_ID: languageId,
        NOTES: asData(notes),
        RUNNERS: runners.join(', '),
        TOPIC: topic,
    });
}
