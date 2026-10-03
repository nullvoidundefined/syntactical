// The v1 manifest rules, restated against schema 2 fixtures. Each rejection
// asserts the rule names the offending element's path (the same
// `languages[i].…` form the validator has always reported), so a manifest is
// proven to be rejected for the rule under test and not for its schemaVersion.
// Version-independent root-shape cases live in validateManifestRootShape.test.ts.
import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

function buildFreeBank(path: string): Record<string, unknown> {
    return {
        path,
        hash: VALID_HASH,
        access: 'free',
        contentVersion: 1,
        topicCounts: { strings: 2 },
    };
}

function buildPaidBank(path: string, productId: string): Record<string, unknown> {
    return {
        path,
        hash: VALID_HASH,
        access: 'paid',
        productId,
        contentVersion: 3,
        topicCounts: { strings: 4 },
    };
}

function buildLanguage(
    id: string,
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id,
        label: 'Python',
        glyph: 'PY',
        tagline: 'Runtime semantics, stdlib, and the sharp edges.',
        grammar: 'python',
        topics: [{ id: 'strings', label: 'Strings' }],
        misconceptions: [
            {
                id: `${id}.off-by-one`,
                description: 'Counts from one where the language counts from zero.',
            },
        ],
        banks: {
            easy: buildFreeBank(`${id}/easy.json`),
            medium: buildPaidBank(`${id}/medium.json`, `syntactical.${id}.medium`),
            hard: buildPaidBank(`${id}/hard.json`, `syntactical.${id}.hard`),
        },
        ...overrides,
    };
}

function buildManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schemaVersion: 2,
        languages: [
            buildLanguage('python'),
            buildLanguage('sql', { grammar: 'sql', label: 'SQL' }),
        ],
        ...overrides,
    };
}

function buildManifestWithLanguage(
    languageOverrides: Record<string, unknown>,
): Record<string, unknown> {
    return buildManifest({ languages: [buildLanguage('python', languageOverrides)] });
}

function buildManifestWithBanks(banks: unknown): Record<string, unknown> {
    return buildManifestWithLanguage({ banks });
}

function buildManifestWithEasyBank(bankEntry: unknown): Record<string, unknown> {
    return buildManifestWithBanks({ easy: bankEntry });
}

// Rejected, with a rule that starts with the path of the element at fault.
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

describe('validateManifest', () => {
    describe('accepts a well-formed manifest', () => {
        it('returns the manifest unchanged', () => {
            const manifest = buildManifest();
            expect(validateManifest(manifest)).toEqual({ isValid: true, manifest });
        });

        it.each([
            'python',
            'sql',
            'javascript',
            'typescript',
            'go',
            'rust',
            'ruby',
            'bash',
            'plain',
        ])('accepts the supported grammar %p', (grammar) => {
            expect(validateManifest(buildManifestWithLanguage({ grammar })).isValid).toBe(true);
        });

        it('accepts a language with a subset of difficulties', () => {
            const manifest = buildManifestWithBanks({
                hard: buildPaidBank('python/hard.json', 'syntactical.python.hard'),
            });
            expect(validateManifest(manifest).isValid).toBe(true);
        });

        it('accepts boundary values: a 32-character id and 120-character display fields', () => {
            const manifest = buildManifest({
                languages: [
                    buildLanguage('a'.repeat(32), {
                        label: 'L'.repeat(120),
                        glyph: 'G'.repeat(120),
                        tagline: 'T'.repeat(120),
                    }),
                ],
            });
            expect(validateManifest(manifest).isValid).toBe(true);
        });

        it('keeps markup inside display strings as plain data', () => {
            const tagline = '<script>alert(1)</script>';
            const manifest = buildManifestWithLanguage({ tagline });
            const result = validateManifest(manifest);
            expect(result).toEqual({ isValid: true, manifest });
        });
    });

    describe('schemaVersion', () => {
        it('rejects a well-formed manifest declaring schemaVersion 1', () => {
            expect(validateManifest(buildManifest({ schemaVersion: 1 })).isValid).toBe(false);
            expect(validateManifest(buildManifest({ schemaVersion: 2 })).isValid).toBe(true);
        });
    });

    describe('languages', () => {
        it('rejects an empty languages list', () => {
            expectRejectedAt(buildManifest({ languages: [] }), 'languages');
        });

        it.each([
            ['null', null],
            ['a string', 'python'],
            ['an array', [buildLanguage('python')]],
        ])('rejects a language entry that is %s', (_description, languageEntry) => {
            expectRejectedAt(
                buildManifest({ languages: [buildLanguage('python'), languageEntry] }),
                'languages[1].',
            );
        });
    });

    describe('language id', () => {
        it.each([
            ['missing', undefined],
            ['empty', ''],
            ['uppercase', 'Python'],
            ['containing a colon', 'py:thon'],
            ['containing a slash', 'py/thon'],
            ['containing a dot', 'py.thon'],
            ['containing a space', 'py thon'],
            ['containing an underscore', 'py_thon'],
            ['over 32 characters', 'a'.repeat(33)],
            ['a number', 42],
        ])('rejects an id that is %s', (_description, id) => {
            expectRejectedAt(buildManifestWithLanguage({ id }), 'languages[0].');
        });

        it('rejects a duplicate id at index 1 with its exact rule', () => {
            const manifest = buildManifest({
                languages: [buildLanguage('python'), buildLanguage('python')],
            });
            expect(validateManifest(manifest)).toEqual({
                isValid: false,
                rule: 'languages[1].id is a duplicate',
            });
        });

        it('names the index of the later duplicate', () => {
            const manifest = buildManifest({
                languages: [buildLanguage('python'), buildLanguage('sql'), buildLanguage('python')],
            });
            expect(validateManifest(manifest)).toEqual({
                isValid: false,
                rule: 'languages[2].id is a duplicate',
            });
        });
    });

    describe('display fields', () => {
        const displayFieldCases = ['label', 'glyph', 'tagline'].flatMap(
            (field): [string, string, unknown][] => [
                [field, 'missing', undefined],
                [field, 'empty', ''],
                [field, 'over 120 characters', 'x'.repeat(121)],
                [field, 'a number', 7],
                [field, 'null', null],
            ],
        );

        it.each(displayFieldCases)('rejects a %s that is %s', (field, _description, value) => {
            expectRejectedAt(
                buildManifestWithLanguage({ [field as string]: value }),
                'languages[0].',
            );
        });
    });

    describe('grammar', () => {
        it.each([
            ['missing', undefined],
            ['unknown', 'cobol'],
            ['uppercase', 'Python'],
            ['empty', ''],
            ['a number', 1],
        ])('rejects a grammar that is %s', (_description, grammar) => {
            expectRejectedAt(buildManifestWithLanguage({ grammar }), 'languages[0].');
        });
    });

    describe('banks', () => {
        it.each([
            ['missing', undefined],
            ['empty', {}],
            ['null', null],
            ['an array', [buildFreeBank('python/easy.json')]],
            ['a string', 'python/easy.json'],
        ])('rejects a banks value that is %s', (_description, banks) => {
            expectRejectedAt(buildManifestWithBanks(banks), 'languages[0].banks');
        });

        it.each(['expert', 'Easy', 'EASY', '', 'beginner'])(
            'rejects the unknown difficulty key %p',
            (difficulty) => {
                expectRejectedAt(
                    buildManifestWithBanks({
                        easy: buildFreeBank('python/easy.json'),
                        [difficulty]: buildFreeBank('python/other.json'),
                    }),
                    'languages[0].banks',
                );
            },
        );

        it.each([
            ['null', null],
            ['a string', 'python/easy.json'],
            [
                'missing its path',
                { hash: VALID_HASH, access: 'free', contentVersion: 1, topicCounts: {} },
            ],
            [
                'missing its hash',
                { path: 'python/easy.json', access: 'free', contentVersion: 1, topicCounts: {} },
            ],
        ])('rejects a bank entry that is %s', (_description, bankEntry) => {
            expectRejectedAt(buildManifestWithEasyBank(bankEntry), 'languages[0].banks.easy');
        });
    });

    describe('bank hash', () => {
        it.each([
            ['empty', ''],
            ['63 characters', VALID_HASH.slice(1)],
            ['65 characters', `${VALID_HASH}a`],
            ['uppercase hex', VALID_HASH.toUpperCase()],
            ['containing a non-hex character', `g${VALID_HASH.slice(1)}`],
            ['a placeholder', '<sha256 of the file>'],
            ['a number', 123],
        ])('rejects a hash that is %s', (_description, hash) => {
            expectRejectedAt(
                buildManifestWithEasyBank({ ...buildFreeBank('python/easy.json'), hash }),
                'languages[0].banks.easy',
            );
        });
    });

    describe('bank path', () => {
        it.each([
            ['empty', ''],
            ['a parent traversal', '../easy.json'],
            ['a nested parent traversal', 'python/../../easy.json'],
            ['a percent-encoded traversal', '%2e%2e/easy.json'],
            ['a backslash path', 'python\\easy.json'],
            ['root-relative', '/python/easy.json'],
            ['an absolute URL', 'https://evil.example/python/easy.json'],
            ['protocol-relative', '//evil.example/python/easy.json'],
            ['a non-json extension', 'python/easy.js'],
            ['uppercase', 'Python/easy.json'],
            ['carrying a query string', 'python/easy.json?v=1'],
            ['a number', 5],
        ])('rejects a path that is %s', (_description, path) => {
            expectRejectedAt(
                buildManifestWithEasyBank({ ...buildFreeBank('python/easy.json'), path }),
                'languages[0].banks.easy',
            );
        });
    });
});
