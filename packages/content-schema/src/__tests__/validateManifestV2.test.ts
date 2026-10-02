// B-5: the schema 2 manifest. A bank entry carries access ('free' | 'paid'), a
// productId exactly when paid (equal to `syntactical.<language>.<difficulty>`),
// a positive integer contentVersion, and topicCounts keyed by that language's
// topic ids. A language entry carries its topics and misconception taxonomy.
// Every rejection asserts the rule names the element at fault, so a fixture is
// never rejected for an unrelated reason.
import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

type Fixture = Record<string, unknown>;

function buildFreeBank(language: string, difficulty: string, overrides: Fixture = {}): Fixture {
    return {
        path: `${language}/${difficulty}.json`,
        hash: VALID_HASH,
        access: 'free',
        contentVersion: 1,
        topicCounts: {},
        ...overrides,
    };
}

function buildPaidBank(language: string, difficulty: string, overrides: Fixture = {}): Fixture {
    return {
        path: `${language}/${difficulty}.json`,
        hash: VALID_HASH,
        access: 'paid',
        productId: `syntactical.${language}.${difficulty}`,
        contentVersion: 1,
        topicCounts: {},
        ...overrides,
    };
}

function buildPython(overrides: Fixture = {}): Fixture {
    return {
        id: 'python',
        label: 'Python',
        glyph: 'PY',
        tagline: 'Runtime semantics, stdlib, and the sharp edges.',
        grammar: 'python',
        topics: [
            { id: 'strings', label: 'Strings' },
            { id: 'iterables', label: 'Iterables' },
            { id: 'errors-and-control-flow', label: 'Errors and control flow' },
        ],
        misconceptions: [
            {
                id: 'python.mutable-default-args',
                description: 'A default list is created once, not per call.',
            },
            {
                id: 'python.off-by-one',
                description: 'Counts from one where Python counts from zero.',
            },
        ],
        banks: {
            easy: buildFreeBank('python', 'easy', { topicCounts: { strings: 12, iterables: 0 } }),
            medium: buildPaidBank('python', 'medium', {
                contentVersion: 4,
                topicCounts: { iterables: 7 },
            }),
            hard: buildPaidBank('python', 'hard', {
                topicCounts: { 'errors-and-control-flow': 3 },
            }),
        },
        ...overrides,
    };
}

function buildSql(overrides: Fixture = {}): Fixture {
    return {
        id: 'sql',
        label: 'SQL',
        glyph: 'SQL',
        tagline: 'Joins, nulls, and the planner.',
        grammar: 'sql',
        topics: [{ id: 'security', label: 'Security' }],
        misconceptions: [{ id: 'sql.null-equals-null', description: 'NULL = NULL is not true.' }],
        banks: {
            easy: buildFreeBank('sql', 'easy', { topicCounts: { security: 1 } }),
            medium: buildPaidBank('sql', 'medium'),
        },
        ...overrides,
    };
}

function buildManifest(languages: unknown[] = [buildPython(), buildSql()]): Fixture {
    return { schemaVersion: 2, languages };
}

// A python language whose banks reference no topics, so topic and
// misconception list problems are the only problems in the manifest.
function buildManifestWithPythonLists(overrides: Fixture): Fixture {
    return buildManifest([
        buildPython({
            banks: {
                easy: buildFreeBank('python', 'easy'),
                medium: buildPaidBank('python', 'medium'),
            },
            ...overrides,
        }),
    ]);
}

function buildManifestWithPythonBank(difficulty: string, bankEntry: unknown): Fixture {
    const python = buildPython();
    return buildManifest([
        buildPython({ banks: { ...(python.banks as Fixture), [difficulty]: bankEntry } }),
    ]);
}

function expectRejectedAt(input: unknown, rulePrefix: string): void {
    const result = validateManifest(input);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
        expect(
            result.rule.startsWith(rulePrefix),
            `rule "${result.rule}" should start with "${rulePrefix}"`,
        ).toBe(true);
    }
}

function expectAccepted(input: unknown): void {
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
}

describe('validateManifest schema 2', () => {
    describe('accepts', () => {
        it('a manifest with free and paid banks, topics, and misconceptions, returned unchanged', () => {
            expectAccepted(buildManifest());
        });

        it('a language whose topics and misconceptions are empty lists', () => {
            expectAccepted(buildManifestWithPythonLists({ topics: [], misconceptions: [] }));
        });

        it('a bank whose topicCounts is empty or holds a zero count', () => {
            expectAccepted(
                buildManifest([
                    buildPython({
                        banks: {
                            easy: buildFreeBank('python', 'easy', { topicCounts: {} }),
                            hard: buildPaidBank('python', 'hard', { topicCounts: { strings: 0 } }),
                        },
                    }),
                ]),
            );
        });

        it('a large contentVersion', () => {
            expectAccepted(
                buildManifestWithPythonBank(
                    'medium',
                    buildPaidBank('python', 'medium', { contentVersion: 9999 }),
                ),
            );
        });

        it('a topic label of 120 characters and a misconception description of 280 characters', () => {
            expectAccepted(
                buildManifestWithPythonLists({
                    topics: [{ id: 'strings', label: 'L'.repeat(120) }],
                    misconceptions: [{ id: 'python.off-by-one', description: 'D'.repeat(280) }],
                }),
            );
        });

        it('a misconception id whose language id contains a hyphen', () => {
            const language = buildPython({
                id: 'c-sharp',
                grammar: 'plain',
                misconceptions: [
                    {
                        id: 'c-sharp.boxing-hides-copies',
                        description: 'Boxing copies a value type.',
                    },
                ],
                banks: {
                    easy: buildFreeBank('c-sharp', 'easy'),
                    hard: buildPaidBank('c-sharp', 'hard'),
                },
            });
            expectAccepted(buildManifest([language]));
        });
    });

    describe('schemaVersion', () => {
        it('rejects a manifest declaring schemaVersion 1', () => {
            expect(validateManifest({ ...buildManifest(), schemaVersion: 1 }).isValid).toBe(false);
        });
    });

    describe('bank access', () => {
        it.each([
            ['missing', undefined],
            ['an unknown value', 'premium'],
            ['capitalized', 'Free'],
            ['empty', ''],
            ['null', null],
            ['a boolean', true],
        ])('rejects an access that is %s', (_description, access) => {
            expectRejectedAt(
                buildManifestWithPythonBank('easy', buildFreeBank('python', 'easy', { access })),
                'languages[0].banks.easy',
            );
        });

        it('rejects a v1-shaped bank entry carrying only path and hash', () => {
            expectRejectedAt(
                buildManifestWithPythonBank('easy', { path: 'python/easy.json', hash: VALID_HASH }),
                'languages[0].banks.easy',
            );
        });
    });

    describe('productId', () => {
        it('rejects a paid bank without a productId', () => {
            const bank = buildPaidBank('python', 'medium');
            delete bank.productId;
            expectRejectedAt(
                buildManifestWithPythonBank('medium', bank),
                'languages[0].banks.medium',
            );
        });

        it('rejects a free bank that carries a productId, even the matching one', () => {
            expectRejectedAt(
                buildManifestWithPythonBank(
                    'easy',
                    buildFreeBank('python', 'easy', { productId: 'syntactical.python.easy' }),
                ),
                'languages[0].banks.easy',
            );
        });

        it.each([
            ['another difficulty', 'syntactical.python.hard'],
            ['another language', 'syntactical.sql.medium'],
            ['another prefix', 'com.syntactical.python.medium'],
            ['uppercase', 'Syntactical.Python.Medium'],
            ['a trailing suffix', 'syntactical.python.medium.v2'],
            ['empty', ''],
            ['null', null],
            ['a number', 42],
        ])('rejects a paid productId naming %s', (_description, productId) => {
            expectRejectedAt(
                buildManifestWithPythonBank(
                    'medium',
                    buildPaidBank('python', 'medium', { productId }),
                ),
                'languages[0].banks.medium',
            );
        });

        it("checks the productId against its own language, not the first language's", () => {
            const sql = buildSql({
                banks: {
                    medium: buildPaidBank('sql', 'medium', {
                        productId: 'syntactical.python.medium',
                    }),
                },
            });
            expectRejectedAt(buildManifest([buildPython(), sql]), 'languages[1].banks.medium');
        });
    });

    describe('contentVersion', () => {
        it.each([
            ['missing', undefined],
            ['zero', 0],
            ['negative', -1],
            ['a non-integer', 1.5],
            ['a numeric string', '1'],
            ['null', null],
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
        ])('rejects a contentVersion that is %s', (_description, contentVersion) => {
            expectRejectedAt(
                buildManifestWithPythonBank(
                    'easy',
                    buildFreeBank('python', 'easy', { contentVersion }),
                ),
                'languages[0].banks.easy',
            );
        });
    });

    describe('topicCounts', () => {
        it.each([
            ['missing', undefined],
            ['null', null],
            ['an array', [['strings', 1]]],
            ['a number', 3],
        ])('rejects a topicCounts that is %s', (_description, topicCounts) => {
            expectRejectedAt(
                buildManifestWithPythonBank(
                    'easy',
                    buildFreeBank('python', 'easy', { topicCounts }),
                ),
                'languages[0].banks.easy',
            );
        });

        it.each([
            ['unknown anywhere', 'generics'],
            ["only in another language's topics", 'security'],
            ['a case variant of a listed topic', 'Strings'],
            ['a prototype key', '__proto__'],
            ['constructor, which is not listed', 'constructor'],
        ])('rejects a topicCounts key that is %s', (_description, topicId) => {
            expectRejectedAt(
                buildManifestWithPythonBank(
                    'easy',
                    buildFreeBank('python', 'easy', { topicCounts: { [topicId]: 1 } }),
                ),
                'languages[0].banks.easy',
            );
        });

        it.each([
            ['negative', -1],
            ['a non-integer', 2.5],
            ['a numeric string', '3'],
            ['null', null],
            ['NaN', Number.NaN],
            ['over the bank question cap', 501],
        ])('rejects a topicCounts value that is %s', (_description, count) => {
            expectRejectedAt(
                buildManifestWithPythonBank(
                    'easy',
                    buildFreeBank('python', 'easy', { topicCounts: { strings: count } }),
                ),
                'languages[0].banks.easy',
            );
        });
    });

    describe('topics', () => {
        it.each([
            ['missing', undefined],
            ['null', null],
            ['an object', { strings: 'Strings' }],
        ])('rejects a topics value that is %s', (_description, topics) => {
            expectRejectedAt(buildManifestWithPythonLists({ topics }), 'languages[0].topics');
        });

        it.each([
            ['null', null],
            ['a string', 'strings'],
            ['missing its id', { label: 'Strings' }],
            ['missing its label', { id: 'strings' }],
        ])('rejects a topic entry that is %s', (_description, topic) => {
            expectRejectedAt(
                buildManifestWithPythonLists({ topics: [topic] }),
                'languages[0].topics',
            );
        });

        it.each([
            ['empty', ''],
            ['uppercase', 'Strings'],
            ['snake case', 'data_structures'],
            ['containing a space', 'data structures'],
            ['containing a dot', 'python.strings'],
            ['leading with a hyphen', '-strings'],
            ['trailing with a hyphen', 'strings-'],
            ['holding a double hyphen', 'data--structures'],
            ['a number', 7],
        ])('rejects a topic id that is %s', (_description, id) => {
            expectRejectedAt(
                buildManifestWithPythonLists({
                    topics: [
                        { id: 'strings', label: 'Strings' },
                        { id, label: 'Topic' },
                    ],
                }),
                'languages[0].topics',
            );
        });

        it('rejects a duplicate topic id', () => {
            expectRejectedAt(
                buildManifestWithPythonLists({
                    topics: [
                        { id: 'strings', label: 'Strings' },
                        { id: 'strings', label: 'Text' },
                    ],
                }),
                'languages[0].topics',
            );
        });

        it.each([
            ['empty', ''],
            ['over 120 characters', 'x'.repeat(121)],
            ['a number', 7],
            ['null', null],
        ])('rejects a topic label that is %s', (_description, label) => {
            expectRejectedAt(
                buildManifestWithPythonLists({ topics: [{ id: 'strings', label }] }),
                'languages[0].topics',
            );
        });
    });

    describe('misconceptions', () => {
        it.each([
            ['missing', undefined],
            ['null', null],
            ['an object', { 'python.off-by-one': 'Counts from one.' }],
        ])('rejects a misconceptions value that is %s', (_description, misconceptions) => {
            expectRejectedAt(
                buildManifestWithPythonLists({ misconceptions }),
                'languages[0].misconceptions',
            );
        });

        it.each([
            ['null', null],
            ['a string', 'python.off-by-one'],
            ['missing its id', { description: 'Counts from one.' }],
            ['missing its description', { id: 'python.off-by-one' }],
        ])('rejects a misconception entry that is %s', (_description, misconception) => {
            expectRejectedAt(
                buildManifestWithPythonLists({ misconceptions: [misconception] }),
                'languages[0].misconceptions',
            );
        });

        it.each([
            ['empty', ''],
            ['without a language prefix', 'off-by-one'],
            ["prefixed with another language's id", 'sql.off-by-one'],
            ['prefixed with a case variant of the language id', 'Python.off-by-one'],
            ['the prefix alone', 'python.'],
            ['a prefix with no dot', 'python-off-by-one'],
            ['an uppercase slug', 'python.Off-By-One'],
            ['a snake case slug', 'python.off_by_one'],
            ['a slug holding a dot', 'python.off.by-one'],
            ['a slug leading with a hyphen', 'python.-off-by-one'],
            ['a slug trailing with a hyphen', 'python.off-by-one-'],
            ['a number', 7],
        ])('rejects a misconception id that is %s', (_description, id) => {
            expectRejectedAt(
                buildManifestWithPythonLists({
                    misconceptions: [
                        {
                            id: 'python.mutable-default-args',
                            description: 'A default list is created once.',
                        },
                        { id, description: 'A wrong belief.' },
                    ],
                }),
                'languages[0].misconceptions',
            );
        });

        it('rejects a duplicate misconception id', () => {
            expectRejectedAt(
                buildManifestWithPythonLists({
                    misconceptions: [
                        { id: 'python.off-by-one', description: 'Counts from one.' },
                        { id: 'python.off-by-one', description: 'Starts indexes at one.' },
                    ],
                }),
                'languages[0].misconceptions',
            );
        });

        it.each([
            ['empty', ''],
            ['over 280 characters', 'x'.repeat(281)],
            ['a number', 7],
            ['null', null],
        ])('rejects a misconception description that is %s', (_description, description) => {
            expectRejectedAt(
                buildManifestWithPythonLists({
                    misconceptions: [{ id: 'python.off-by-one', description }],
                }),
                'languages[0].misconceptions',
            );
        });

        it('checks misconception ids against their own language at index 1', () => {
            const sql = buildSql({
                misconceptions: [{ id: 'python.off-by-one', description: 'Counts from one.' }],
            });
            expectRejectedAt(buildManifest([buildPython(), sql]), 'languages[1].misconceptions');
        });
    });
});
