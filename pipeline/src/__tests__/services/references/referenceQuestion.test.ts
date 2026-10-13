// referenceQuestion with scripted providers (no model): the writer never sees the answer or the
// explanation, links off the track's hosts are dropped, and a reference either judge flags as
// revealing the answer is rewritten once and then given up on.
import type { Question } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { referenceQuestion } from '../../../services/references/referenceQuestion.js';
import type { ModelProvider, ModelRequest } from '../../../types/ModelProvider.js';

const QUESTION: Question = {
    answerIndex: 1,
    choices: [{ text: 'Bitwise OR' }, { text: 'String concatenation' }],
    code: "SELECT 'foo' || 'bar';",
    id: 'pg-easy-01',
    prompt: 'What does || do between two text values?',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
    query: { explanation: 'SECRET-EXPLANATION-41', title: 't' },
    type: 'mc',
};
const TRACK = { grammar: 'sql', hosts: ['postgresql.org'], label: 'Postgres' };
const REFERENCE = {
    docs: [
        { title: 'String functions', url: 'https://www.postgresql.org/docs/current/functions-string.html' },
        { title: 'Made-up blog', url: 'https://example.com/concat' },
    ],
    syntax: "text1 || text2\n-- 'ab' || 'cd'",
    title: 'The || operator',
};

type Verdict = { asksForDefinition?: boolean; revealsAnswer?: boolean; titleRevealsAnswer?: boolean };

// Writes REFERENCE and answers leak checks from `leaks`, one entry per call in order: a boolean is
// `revealsAnswer` on an output question, an object sets each verdict field.
function provider(leaks: (boolean | Verdict)[], requests: ModelRequest<unknown>[] = []): ModelProvider {
    return {
        async generate(request) {
            requests.push(request as ModelRequest<unknown>);
            if (request.promptVersion === 'write-reference-v1') {
                return { model: 'fake', value: request.schema.parse(REFERENCE) };
            }
            const next = leaks.shift() ?? false;
            const verdict = typeof next === 'boolean' ? { revealsAnswer: next } : next;
            const value = {
                asksForDefinition: false,
                reason: 'r',
                revealsAnswer: false,
                titleRevealsAnswer: false,
                ...verdict,
            };
            return { model: 'fake', value: request.schema.parse(value) };
        },
    };
}

describe('referenceQuestion', () => {
    it('accepts a reference both judges clear, dropping links off the track hosts', async () => {
        const requests: ModelRequest<unknown>[] = [];
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([false], requests),
            secondProvider: provider([false]),
        });
        expect(outcome).toEqual({
            reference: { ...REFERENCE, docs: [REFERENCE.docs[0]] },
            status: 'accepted',
        });
        const writePrompt = requests.find(({ promptVersion }) => promptVersion === 'write-reference-v1')?.prompt ?? '';
        expect(writePrompt).not.toContain('SECRET-EXPLANATION-41');
        expect(writePrompt).toContain('postgresql.org');
    });

    it('rewrites a reference the second judge flags, then accepts the rewrite', async () => {
        const requests: ModelRequest<unknown>[] = [];
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([false, false], requests),
            secondProvider: provider([true, false]),
        });
        expect(outcome.status).toBe('accepted');
        expect(requests.filter(({ promptVersion }) => promptVersion === 'write-reference-v1')).toHaveLength(2);
    });

    it('gives up after two references that reveal the answer', async () => {
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([true, true]),
            secondProvider: provider([false, false]),
        });
        expect(outcome).toEqual({ reasons: ['r', 'r'], status: 'reveals-answer' });
    });

    it('holds the syntax back on a definition question and judges only its title and doc titles', async () => {
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([{ asksForDefinition: true, revealsAnswer: true }]),
            secondProvider: provider([{ revealsAnswer: true }]),
        });
        expect(outcome).toEqual({
            reference: { ...REFERENCE, docs: [REFERENCE.docs[0]], isSyntaxAfterAnswer: true },
            status: 'accepted',
        });
    });

    it('rejects a definition question reference whose title gives the answer away', async () => {
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([{ asksForDefinition: true }, { asksForDefinition: true }]),
            secondProvider: provider([{ titleRevealsAnswer: true }, { titleRevealsAnswer: true }]),
        });
        expect(outcome.status).toBe('reveals-answer');
    });
});
