// Fills the readability judge template. The card (prompt, code, both options) and the
// criterion statement are untrusted data: `<` is escaped so none of it can close a data tag.
import { readFile } from 'node:fs/promises';

import type { AbQuestion } from '../../types/ab/AbQuestion.js';
import { escapeForPrompt } from '../enrich/escapeForPrompt.js';
import { fillTemplate } from '../enrich/fillTemplate.js';
import { serializeQuestionData } from '../serializeQuestionData.js';

const TEMPLATE_URL = new URL('../../../prompts/judgeReadabilityAb.md', import.meta.url);

export async function buildReadabilityPrompt(question: AbQuestion): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return fillTemplate(template, {
        QUESTION_DATA: serializeQuestionData(question),
        STATEMENT: escapeForPrompt(question.criterion.statement),
    });
}
