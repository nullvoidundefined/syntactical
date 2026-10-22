// referenceQuestion with scripted providers (no model): the writer never sees the answer or the
// explanation, links off the track's hosts are dropped, the leak judges see only the title and
// link titles, and a reference either judge flags is rewritten once and then given up on.
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

// Writes REFERENCE and answers leak checks from `leaks`, one `revealsAnswer` per call in order.
function provider(leaks: boolean[], requests: ModelRequest<unknown>[] = []): ModelProvider {
    return {
        async generate(request) {
            requests.push(request as ModelRequest<unknown>);
            if (request.promptVersion === 'write-reference-v2') {
                return { model: 'fake', value: request.schema.parse(REFERENCE) };
            }
            const value = { reason: 'r', revealsAnswer: leaks.shift() ?? false };
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
        const writePrompt = requests.find(({ promptVersion }) => promptVersion === 'write-reference-v2')?.prompt ?? '';
        expect(writePrompt).not.toContain('SECRET-EXPLANATION-41');
        expect(writePrompt).toContain('postgresql.org');
        const leakPrompt =
            requests.find(({ promptVersion }) => promptVersion === 'check-reference-leak-v4')?.prompt ?? '';
        expect(leakPrompt).toContain('The || operator');
        expect(leakPrompt).not.toContain('text1 || text2');
    });

    it('rewrites a reference the second judge flags, then accepts the rewrite', async () => {
        const requests: ModelRequest<unknown>[] = [];
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([false, false], requests),
            secondProvider: provider([true, false]),
        });
        expect(outcome.status).toBe('accepted');
        expect(requests.filter(({ promptVersion }) => promptVersion === 'write-reference-v2')).toHaveLength(2);
    });

    it('gives up after two references that reveal the answer', async () => {
        const outcome = await referenceQuestion(QUESTION, TRACK, {
            provider: provider([true, true]),
            secondProvider: provider([false, false]),
        });
        expect(outcome).toEqual({ reasons: ['r', 'r'], status: 'reveals-answer' });
    });
});
