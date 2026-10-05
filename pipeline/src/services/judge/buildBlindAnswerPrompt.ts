// Selects only the fields this pass may see and escapes data before filling the template.
import { readFile } from 'node:fs/promises';
import type { Question } from '@syntactical/content-schema';
import { escapeForPrompt } from '../enrich/escapeForPrompt.js';
import { fillTemplate } from '../enrich/fillTemplate.js';
const TEMPLATE_URL = new URL('../../../prompts/blindAnswer.md', import.meta.url);
const JSON_INDENT = 2;
function asData(value: unknown): string {
    return escapeForPrompt(JSON.stringify(value, null, JSON_INDENT));
}
export async function buildBlindAnswerPrompt(question: Question, choices: readonly string[]): Promise<string> {
    const { prompt, code } = question;
    return fillTemplate(await readFile(TEMPLATE_URL, 'utf8'), {
        QUESTION: asData({
            prompt,
            ...(code === undefined ? {} : { code }),
            choices: choices.map((text, index) => ({ index, text })),
        }),
    });
}
