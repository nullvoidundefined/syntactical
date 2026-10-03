// Fills the judge prompt template. The question, observed output, and rationale are all
// untrusted data (`<` escaped, inside data tags).
import { readFile } from 'node:fs/promises';

import type { Question } from '@syntactical/content-schema';

import { serializeQuestionData } from '../serializeQuestionData.js';

import { describeCorrectAnswer } from './describeCorrectAnswer.js';
import { escapeForPrompt } from './escapeForPrompt.js';
import { fillTemplate } from './fillTemplate.js';

const TEMPLATE_URL = new URL('../../../prompts/judgeRationale.md', import.meta.url);

export async function buildJudgePrompt(question: Question, observed: string, rationale: string): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return fillTemplate(template, {
        CORRECT: describeCorrectAnswer(question),
        OBSERVED: escapeForPrompt(observed),
        QUESTION_DATA: serializeQuestionData(question),
        RATIONALE: escapeForPrompt(rationale),
    });
}
