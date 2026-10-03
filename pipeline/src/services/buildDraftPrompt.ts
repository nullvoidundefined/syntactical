// Fills the draft-oracle prompt template. The question is untrusted data: it goes
// in as JSON inside the data tags, with `<` escaped so no question text can close
// the tag and smuggle text outside it.
import { readFile } from 'node:fs/promises';

import type { Question } from '@syntactical/content-schema';

import type { OracleLanguage } from '../types/OracleLanguage.js';

const TEMPLATE_URL = new URL('../../prompts/draftOracle.md', import.meta.url);

const JSON_INDENT = 2;

function toQuestionData(question: Question): string {
    const { code, prompt } = question;
    const choices = 'choices' in question ? question.choices : undefined;
    return JSON.stringify({ choices, code, prompt }, null, JSON_INDENT).replaceAll('<', '\\u003c');
}

export async function buildDraftPrompt(question: Question, language: OracleLanguage): Promise<string> {
    const template = await readFile(TEMPLATE_URL, 'utf8');
    return template
        .replaceAll('{{LANGUAGE}}', language)
        .replace('{{QUESTION_DATA}}', () => toQuestionData(question));
}
