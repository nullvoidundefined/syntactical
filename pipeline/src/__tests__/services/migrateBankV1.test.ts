// B-7a: the one-time schema 1 to schema 2 bank converter. An `mc` question's
// string choices become `{ text }` objects in the same order with the same
// answerIndex; a `bool` question keeps its answer; id, type, prompt, code, and
// query are kept exactly; every question gains an 'original', judged, pending,
// not-human-reviewed provenance and nothing else (no topic, rationale, or
// misconceptionId). Input that is not a schema 1 bank throws. The converted
// v1 fixture banks must pass the real v2 validator with zero drops. The medium
// and hard fixtures are synthetic: paid question text never lives in this repo (B-60).
import { readFileSync } from 'node:fs';

import { buildBankContext, validateManifest, validateQuestionBank } from '@syntactical/content-schema';
import type { LanguageEntry } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { migrateBankV1 } from '../../services/migrateBankV1.js';
import { migrateManifestV1 } from '../../services/migrateManifestV1.js';

const CONTENT_ROOT = new URL('../fixtures/v1-content/', import.meta.url);

const EXPECTED_PROVENANCE = {
    source: 'original',
    validation: { method: 'judged', status: 'pending' },
    isHumanReviewed: false,
};

const EMPTY_CONTEXT = { topicIds: [], misconceptionIds: [] };

type Fixture = Record<string, unknown>;

function buildMcV1(overrides: Fixture = {}): Fixture {
    return {
        id: 'py-easy-01',
        type: 'mc',
        prompt: 'What does `int(-3.9)` evaluate to?',
        code: 'int(-3.9)',
        choices: ['-4', '-3', '-3.9', 'Raises a TypeError'],
        answerIndex: 1,
        query: {
            title: 'int() truncates toward zero',
            explanation: 'int() on a float truncates toward zero.',
            tags: ['type-conversion', 'numbers'],
        },
        ...overrides,
    };
}

function buildBoolV1(overrides: Fixture = {}): Fixture {
    return {
        id: 'py-easy-06',
        type: 'bool',
        prompt: '`1 < 2 < 3` is evaluated as `(1 < 2) and (2 < 3)`.',
        answer: true,
        query: {
            title: 'Chained comparisons',
            syntax: '1 < 2 < 3   # True',
            explanation: 'A comparison chain is an implicit and of each adjacent pair.',
            tags: ['operators'],
        },
        ...overrides,
    };
}

function buildBankV1(questions: unknown[]): Fixture {
    return { schemaVersion: 1, questions };
}

function readJson(relativePath: string): unknown {
    return JSON.parse(readFileSync(new URL(relativePath, CONTENT_ROOT), 'utf8'));
}

describe('migrateBankV1', () => {
    it('sets schemaVersion 2 and keeps the question order', () => {
        const converted = migrateBankV1(
            buildBankV1([buildMcV1({ id: 'q-a' }), buildBoolV1({ id: 'q-b' }), buildMcV1({ id: 'q-c' })]),
        );

        expect(converted.schemaVersion).toBe(2);
        expect(converted.questions.map((question) => (question as Fixture).id)).toEqual(['q-a', 'q-b', 'q-c']);
    });

    it('wraps mc string choices as { text } in order, keeps answerIndex and every other field, and adds provenance', () => {
        const source = buildMcV1();

        const [question] = migrateBankV1(buildBankV1([source])).questions;

        expect(question).toStrictEqual({
            id: 'py-easy-01',
            type: 'mc',
            prompt: 'What does `int(-3.9)` evaluate to?',
            code: 'int(-3.9)',
            choices: [{ text: '-4' }, { text: '-3' }, { text: '-3.9' }, { text: 'Raises a TypeError' }],
            answerIndex: 1,
            query: {
                title: 'int() truncates toward zero',
                explanation: 'int() on a float truncates toward zero.',
                tags: ['type-conversion', 'numbers'],
            },
            provenance: EXPECTED_PROVENANCE,
        });
    });

    it('keeps a bool answer and every other field, adds provenance, and adds no choices', () => {
        const [trueQuestion, falseQuestion] = migrateBankV1(
            buildBankV1([buildBoolV1(), buildBoolV1({ id: 'py-easy-07', answer: false })]),
        ).questions;

        expect(trueQuestion).toStrictEqual({ ...buildBoolV1(), provenance: EXPECTED_PROVENANCE });
        expect(falseQuestion).toStrictEqual({
            ...buildBoolV1({ id: 'py-easy-07', answer: false }),
            provenance: EXPECTED_PROVENANCE,
        });
    });

    it('keeps a question with no code field without adding one', () => {
        const source = buildMcV1();
        delete source.code;

        const [question] = migrateBankV1(buildBankV1([source])).questions as Fixture[];

        expect('code' in question).toBe(false);
    });

    it('adds no topic, rationale, or misconceptionId to a question or a choice', () => {
        const [mcQuestion, boolQuestion] = migrateBankV1(buildBankV1([buildMcV1(), buildBoolV1()]))
            .questions as Fixture[];

        for (const question of [mcQuestion, boolQuestion]) {
            expect(question).not.toHaveProperty('topic');
            expect(question).not.toHaveProperty('rationale');
            expect(question).not.toHaveProperty('misconceptionId');
        }
        for (const choice of mcQuestion.choices as Fixture[]) {
            expect(Object.keys(choice)).toEqual(['text']);
        }
    });

    it('gives each question its own provenance object', () => {
        const [first, second] = migrateBankV1(buildBankV1([buildMcV1({ id: 'q-a' }), buildMcV1({ id: 'q-b' })]))
            .questions as Fixture[];

        (first.provenance as Fixture).isHumanReviewed = true;

        expect(second.provenance).toStrictEqual(EXPECTED_PROVENANCE);
    });

    it('does not modify its input', () => {
        const input = buildBankV1([buildMcV1(), buildBoolV1()]);
        const snapshot = structuredClone(input);

        migrateBankV1(input);

        expect(input).toStrictEqual(snapshot);
    });

    it('produces a bank the v2 validator accepts with zero drops', () => {
        const converted = migrateBankV1(buildBankV1([buildMcV1(), buildBoolV1()]));

        const result = validateQuestionBank(converted, EMPTY_CONTEXT);

        expect(result).toMatchObject({ isValid: true, dropped: [] });
        expect(result.isValid && result.questions.map((question) => question.id)).toEqual(['py-easy-01', 'py-easy-06']);
    });

    it.each([
        ['null', null],
        ['an array', [buildMcV1()]],
        ['a string', 'schemaVersion: 1'],
        ['a bank with no questions list', { schemaVersion: 1 }],
        ['a bank whose questions is not a list', { schemaVersion: 1, questions: {} }],
        ['a bank with no schemaVersion', { questions: [buildMcV1()] }],
        ['a schema 2 bank', { schemaVersion: 2, questions: [buildMcV1()] }],
        ['a schema 3 bank', { schemaVersion: 3, questions: [buildMcV1()] }],
    ])('throws on %s', (_label, input) => {
        expect(() => migrateBankV1(input)).toThrow();
    });

    it('throws on an already converted v2 bank rather than wrapping its choices twice', () => {
        const converted = migrateBankV1(buildBankV1([buildMcV1()]));

        expect(() => migrateBankV1(converted)).toThrow();
    });
});

describe('migrateBankV1 over the v1 fixture content', () => {
    const manifestV1 = readJson('manifest.json') as {
        languages: { id: string; banks: Record<string, { path: string }> }[];
    };
    const bankCases = manifestV1.languages.flatMap((language) =>
        Object.entries(language.banks).map(([difficulty, bank]) => ({
            languageId: language.id,
            difficulty,
            path: bank.path,
        })),
    );

    it('covers all nine fixture banks', () => {
        expect(bankCases).toHaveLength(9);
    });

    it.each(bankCases)('converts $path to a valid v2 bank with every question kept', ({ languageId, path }) => {
        const bankV1 = readJson(path) as { schemaVersion: number; questions: { id: string }[] };
        expect(bankV1.schemaVersion).toBe(1);
        const manifestResult = validateManifest(migrateManifestV1(manifestV1));
        expect(manifestResult.isValid).toBe(true);
        const languageV2 = manifestResult.isValid
            ? manifestResult.manifest.languages.find((language: LanguageEntry) => language.id === languageId)
            : undefined;
        expect(languageV2).toBeDefined();

        const converted = migrateBankV1(bankV1);
        const result = validateQuestionBank(converted, buildBankContext(languageV2 as LanguageEntry));

        expect(converted.questions).toHaveLength(bankV1.questions.length);
        expect(result).toMatchObject({ isValid: true, dropped: [], droppedQuestionIds: [] });
        expect(result.isValid && result.questions.map((question) => question.id)).toEqual(
            bankV1.questions.map((question) => question.id),
        );
    });
});
