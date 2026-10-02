// B-5: buildBankContext turns a manifest language entry into the BankContext
// both bank validators take: its topic ids and misconception ids, in list order.
import { describe, expect, it } from 'vitest';

import { buildBankContext } from '../buildBankContext.js';
import * as schema from '../index.js';
import type { LanguageEntry } from '../types/LanguageEntry.js';
import { validateQuestionBank } from '../validateQuestionBank.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

function buildLanguage(overrides: Partial<LanguageEntry> = {}): LanguageEntry {
    return {
        id: 'python',
        label: 'Python',
        glyph: 'PY',
        tagline: 'Runtime semantics, stdlib, and the sharp edges.',
        grammar: 'python',
        topics: [
            { id: 'strings', label: 'Strings' },
            { id: 'iterables', label: 'Iterables' },
            { id: 'async-and-concurrency', label: 'Async and concurrency' },
        ],
        misconceptions: [
            {
                id: 'python.off-by-one',
                description: 'Counts from one where Python counts from zero.',
            },
            {
                id: 'python.mutable-default-args',
                description: 'A default list is created once, not per call.',
            },
        ],
        banks: {
            easy: {
                path: 'python/easy.json',
                hash: VALID_HASH,
                access: 'free',
                contentVersion: 1,
                topicCounts: { strings: 1 },
            },
        },
        ...overrides,
    };
}

function buildQuestion(id: string, topic: string): Record<string, unknown> {
    return {
        id,
        type: 'bool',
        prompt: 'Strings are immutable.',
        answer: true,
        topic,
        query: {
            title: 'String immutability',
            explanation: 'A string cannot be changed in place.',
        },
        provenance: {
            source: 'original',
            validation: { method: 'executed', status: 'passed' },
            isHumanReviewed: false,
        },
    };
}

describe('buildBankContext', () => {
    it('returns the topic ids and misconception ids in list order, without labels or descriptions', () => {
        expect(buildBankContext(buildLanguage())).toEqual({
            topicIds: ['strings', 'iterables', 'async-and-concurrency'],
            misconceptionIds: ['python.off-by-one', 'python.mutable-default-args'],
        });
    });

    it('returns empty lists for a language with no topics or misconceptions', () => {
        expect(buildBankContext(buildLanguage({ topics: [], misconceptions: [] }))).toEqual({
            topicIds: [],
            misconceptionIds: [],
        });
    });

    it('gives validateQuestionBank a context that keeps a listed topic and drops an unlisted one', () => {
        const bank = {
            schemaVersion: 2,
            questions: [
                buildQuestion('python-easy-001', 'iterables'),
                buildQuestion('python-easy-002', 'security'),
            ],
        };

        const result = validateQuestionBank(bank, buildBankContext(buildLanguage()));

        expect(result.isValid).toBe(true);
        if (result.isValid) {
            expect(result.questions.map((question) => question.id)).toEqual(['python-easy-001']);
            expect(result.droppedQuestionIds).toEqual(['python-easy-002']);
        }
    });

    it('is exported from the package entry point', () => {
        expect(schema).toHaveProperty('buildBankContext', buildBankContext);
    });
});
