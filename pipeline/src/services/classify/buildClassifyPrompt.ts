// Fills the classify prompt template. The question is untrusted data (JSON inside the data
// tags, `<` escaped); the topic ids come from the validated manifest or topics.json.
import { readFile } from 'node:fs/promises';

import type { Question } from '@syntactical/content-schema';

import { serializeQuestionData } from '../serializeQuestionData.js';

const TEMPLATE_URL = new URL('../../../prompts/classifyQuestion.md', import.meta.url);

export async function buildClassifyPrompt(question: Question, topics: readonly string[]): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return template
        .replace('{{TOPICS}}', () => topics.map((topic) => `- ${topic}`).join('\n'))
        .replace('{{QUESTION_DATA}}', () => serializeQuestionData(question));
}
