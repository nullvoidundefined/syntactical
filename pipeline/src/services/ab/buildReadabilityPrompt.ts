// Fills the readability judge template. The card (prompt, code, both options) and the
// criterion statement are untrusted data: `<` is escaped so none of it can close a data tag.
// The judge sees only the prompt, the shared code, and each option's code and text: a choice's
// rationale (which names the wrong option), the stored evidence, and the query would leak the answer.
import { readFile } from 'node:fs/promises';

import type { AbQuestion } from '../../types/ab/AbQuestion.js';
import { escapeForPrompt } from '../enrich/escapeForPrompt.js';
import { fillTemplate } from '../enrich/fillTemplate.js';

const JSON_INDENT = 2;
const TEMPLATE_URL = new URL('../../../prompts/judgeReadabilityAb.md', import.meta.url);

function serializeJudgeData(question: AbQuestion): string {
    const { choices, code, prompt } = question;
    const options = choices.map(({ code: optionCode, text }) => ({ code: optionCode, text }));
    return JSON.stringify({ choices: options, code, prompt }, null, JSON_INDENT).replaceAll('<', '\\u003c');
}

export async function buildReadabilityPrompt(question: AbQuestion): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return fillTemplate(template, {
        QUESTION_DATA: serializeJudgeData(question),
        STATEMENT: escapeForPrompt(question.criterion.statement),
    });
}
