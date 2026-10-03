// Fills the rationales prompt template. The question and the observed output are untrusted
// data (`<` escaped, inside data tags); the taxonomy comes from the owner-approved file.
import { readFile } from 'node:fs/promises';

import { CONTENT_LIMITS, type Question } from '@syntactical/content-schema';

import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';
import { serializeQuestionData } from '../serializeQuestionData.js';

import { describeCorrectAnswer } from './describeCorrectAnswer.js';
import { escapeForPrompt } from './escapeForPrompt.js';
import { wrongChoiceIndexes } from './wrongChoiceIndexes.js';

const TEMPLATE_URL = new URL('../../../prompts/writeRationales.md', import.meta.url);

export async function buildRationalesPrompt(
    question: Question,
    observed: string,
    taxonomy: readonly TaxonomyEntry[],
): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return template
        .replace('{{CORRECT}}', () => describeCorrectAnswer(question))
        .replace('{{LENGTH}}', () => String(CONTENT_LIMITS.rationaleLength))
        .replace('{{OBSERVED}}', () => escapeForPrompt(observed))
        .replace('{{QUESTION_DATA}}', () => serializeQuestionData(question))
        .replace('{{TAXONOMY}}', () => taxonomy.map(({ description, id }) => `- ${id}: ${description}`).join('\n'))
        .replace('{{WRONG}}', () => wrongChoiceIndexes(question).join(', '));
}
