// Fills the rationales prompt template. The question, the observed output, and the explanation
// are untrusted data (`<` escaped, inside data tags); the taxonomy comes from the owner-approved
// file. Without observed output the answer-key template grounds the rationales in the correct
// answer and the question's explanation instead.
import { readFile } from 'node:fs/promises';

import { CONTENT_LIMITS, type Question } from '@syntactical/content-schema';

import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';
import { serializeQuestionData } from '../serializeQuestionData.js';

import { describeCorrectAnswer } from './describeCorrectAnswer.js';
import { escapeForPrompt } from './escapeForPrompt.js';
import { fillTemplate } from './fillTemplate.js';
import { wrongChoiceIndexes } from './wrongChoiceIndexes.js';

const TEMPLATE_URL = new URL('../../../prompts/writeRationales.md', import.meta.url);
const KEY_TEMPLATE_URL = new URL('../../../prompts/writeRationalesFromKey.md', import.meta.url);

export async function buildRationalesPrompt(
    question: Question,
    observed: string | undefined,
    taxonomy: readonly TaxonomyEntry[],
): Promise<string> {
    const template = await readFile(observed === undefined ? KEY_TEMPLATE_URL : TEMPLATE_URL, 'utf8');
    return fillTemplate(template, {
        CORRECT: describeCorrectAnswer(question),
        EXPLANATION: observed === undefined ? escapeForPrompt(question.query.explanation) : '',
        LENGTH: String(CONTENT_LIMITS.rationaleLength),
        OBSERVED: escapeForPrompt(observed ?? ''),
        QUESTION_DATA: serializeQuestionData(question),
        TAXONOMY: taxonomy.map(({ description, id }) => `- ${id}: ${description}`).join('\n'),
        WRONG: wrongChoiceIndexes(question).join(', '),
    });
}
