// Fills the judge prompt template. The question, observed output, explanation, and rationale are
// all untrusted data (`<` escaped, inside data tags). Without observed output the answer-key
// template judges the rationale against the correct answer and the question's explanation.
import { readFile } from 'node:fs/promises';

import type { Question } from '@syntactical/content-schema';

import { serializeQuestionData } from '../serializeQuestionData.js';

import { describeCorrectAnswer } from './describeCorrectAnswer.js';
import { escapeForPrompt } from './escapeForPrompt.js';
import { fillTemplate } from './fillTemplate.js';

const TEMPLATE_URL = new URL('../../../prompts/judgeRationale.md', import.meta.url);
const KEY_TEMPLATE_URL = new URL('../../../prompts/judgeRationaleFromKey.md', import.meta.url);

export async function buildJudgePrompt(
    question: Question,
    observed: string | undefined,
    rationale: string,
): Promise<string> {
    const template = await readFile(observed === undefined ? KEY_TEMPLATE_URL : TEMPLATE_URL, 'utf8');
    return fillTemplate(template, {
        CORRECT: describeCorrectAnswer(question),
        EXPLANATION: observed === undefined ? escapeForPrompt(question.query.explanation) : '',
        OBSERVED: escapeForPrompt(observed ?? ''),
        QUESTION_DATA: serializeQuestionData(question),
        RATIONALE: escapeForPrompt(rationale),
    });
}
