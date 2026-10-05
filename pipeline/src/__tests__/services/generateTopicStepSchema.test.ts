// One generation turn for a topic track: run code, a finished executed draft, or a
// not-executable draft with cited sources. Exactly one key; strict objects throughout.
import { describe, expect, it } from 'vitest';

import { generateTopicStepSchema } from '../../services/gapFill/generateTopicStepSchema.js';

const QUERY = { explanation: 'String formatting splices the payload into SQL.', title: 'Tautology injection' };
const EXECUTED = {
    answerIndex: 1,
    choices: [{ rationale: 'The payload rewrites the WHERE clause.', text: 'Only alice' }, { text: 'alice and bob' }],
    code: 'f"SELECT name FROM users WHERE name = \'{name}\'"',
    oracle: { code: 'print("alice and bob")', language: 'postgres', setupSql: 'CREATE TABLE users (name text);' },
    prompt: 'Which rows come back?',
    query: QUERY,
    type: 'mc',
};
const JUDGED = {
    answer: true,
    grammar: 'plain',
    prompt: 'SameSite=Lax withholds the session cookie on a cross-site form POST.',
    query: QUERY,
    rationale: 'Lax sends cookies on top-level GET navigations only.',
    sources: [
        {
            quote: 'Cookies are not sent on normal cross-site subrequests',
            title: 'Using HTTP cookies',
            url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
        },
    ],
    type: 'bool',
};

describe('generateTopicStepSchema', () => {
    it('accepts an execute request', () => {
        expect(
            generateTopicStepSchema.safeParse({ execute: { code: 'print(1)', language: 'python' } }).success,
        ).toBe(true);
    });

    it('accepts an executed draft with a postgres oracle and choice rationales', () => {
        expect(generateTopicStepSchema.safeParse({ question: EXECUTED }).success).toBe(true);
    });

    it('accepts a draft naming a runner outside the track (the drop happens later, not here)', () => {
        expect(
            generateTopicStepSchema.safeParse({
                question: { ...EXECUTED, oracle: { code: 'puts 1', language: 'ruby' } },
            }).success,
        ).toBe(true);
    });

    it('accepts a not-executable draft with a reason and sources', () => {
        expect(
            generateTopicStepSchema.safeParse({
                notExecutable: { question: JUDGED, reason: 'Cookie policy needs a browser.' },
            }).success,
        ).toBe(true);
    });

    it.each([
        ['two keys at once', { execute: { code: 'x', language: 'python' }, question: EXECUTED }],
        ['no key', {}],
        ['a not-executable draft with no sources', { notExecutable: { question: { ...JUDGED, sources: [] }, reason: 'r' } }],
        [
            'a not-executable draft with four sources',
            { notExecutable: { question: { ...JUDGED, sources: Array(4).fill(JUDGED.sources[0]) }, reason: 'r' } },
        ],
        [
            'a not-executable draft with an unknown grammar',
            { notExecutable: { question: { ...JUDGED, grammar: 'html' }, reason: 'r' } },
        ],
        ['a not-executable draft with an empty reason', { notExecutable: { question: JUDGED, reason: '' } }],
        ['an execute request carrying an image', { execute: { code: 'x', image: 'alpine', language: 'python' } }],
        ['an executed draft without an oracle language', { question: { ...EXECUTED, oracle: { code: 'print(1)' } } }],
    ])('rejects %s', (_name, value) => {
        expect(generateTopicStepSchema.safeParse(value).success).toBe(false);
    });
});
