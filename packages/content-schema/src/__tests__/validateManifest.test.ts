import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

function buildLanguage(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        label: 'Python',
        glyph: 'PY',
        tagline: 'Runtime semantics, stdlib, and the sharp edges.',
        grammar: 'python',
        banks: {
            easy: { path: `${id}/easy.json`, hash: VALID_HASH },
            medium: { path: `${id}/medium.json`, hash: VALID_HASH },
            hard: { path: `${id}/hard.json`, hash: VALID_HASH },
        },
        ...overrides,
    };
}

function buildManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schemaVersion: 1,
        languages: [buildLanguage('python'), buildLanguage('sql', { grammar: 'sql', label: 'SQL' })],
        ...overrides,
    };
}

function buildManifestWithLanguage(languageOverrides: Record<string, unknown>): Record<string, unknown> {
    return buildManifest({ languages: [buildLanguage('python', languageOverrides)] });
}

function buildManifestWithBanks(banks: unknown): Record<string, unknown> {
    return buildManifestWithLanguage({ banks });
}

function buildManifestWithEasyBank(bankEntry: unknown): Record<string, unknown> {
    return buildManifestWithBanks({ easy: bankEntry });
}

function expectRejected(input: unknown): void {
    const result = validateManifest(input);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
        expect(typeof result.rule).toBe('string');
        expect(result.rule.length).toBeGreaterThan(0);
    }
}

describe('validateManifest', () => {
    describe('accepts a well-formed manifest', () => {
        it('returns the manifest unchanged', () => {
            const manifest = buildManifest();
            expect(validateManifest(manifest)).toEqual({ isValid: true, manifest });
        });

        it.each(['python', 'sql', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'bash', 'plain'])(
            'accepts the supported grammar %p',
            (grammar) => {
                expect(validateManifest(buildManifestWithLanguage({ grammar })).isValid).toBe(true);
            },
        );

        it('accepts a language with a subset of difficulties', () => {
            const manifest = buildManifestWithBanks({ hard: { path: 'python/hard.json', hash: VALID_HASH } });
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

    describe('root shape', () => {
        it.each([
            ['null', null],
            ['undefined', undefined],
            ['a string', 'manifest'],
            ['a number', 1],
            ['an array', [buildManifest()]],
        ])('rejects a root that is %s', (_description, input) => {
            expectRejected(input);
        });
    });

    describe('schemaVersion', () => {
        it.each([
            ['missing', undefined],
            ['newer than supported', 2],
            ['zero', 0],
            ['a non-integer', 1.5],
            ['a numeric string', '1'],
            ['null', null],
        ])('rejects a schemaVersion that is %s', (_description, schemaVersion) => {
            expectRejected(buildManifest({ schemaVersion }));
        });
    });

    describe('languages', () => {
        it.each([
            ['missing', undefined],
            ['empty', []],
            ['an object', { python: buildLanguage('python') }],
            ['a string', 'python'],
        ])('rejects a languages value that is %s', (_description, languages) => {
            expectRejected(buildManifest({ languages }));
        });

        it.each([
            ['null', null],
            ['a string', 'python'],
            ['an array', [buildLanguage('python')]],
        ])('rejects a language entry that is %s', (_description, languageEntry) => {
            expectRejected(buildManifest({ languages: [buildLanguage('python'), languageEntry] }));
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
            expectRejected(buildManifestWithLanguage({ id }));
        });

        it('rejects a duplicate id at index 1 with its exact rule', () => {
            const manifest = buildManifest({ languages: [buildLanguage('python'), buildLanguage('python')] });
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
        const displayFieldCases = ['label', 'glyph', 'tagline'].flatMap((field): [string, string, unknown][] => [
            [field, 'missing', undefined],
            [field, 'empty', ''],
            [field, 'over 120 characters', 'x'.repeat(121)],
            [field, 'a number', 7],
            [field, 'null', null],
        ]);

        it.each(displayFieldCases)('rejects a %s that is %s', (field, _description, value) => {
            expectRejected(buildManifestWithLanguage({ [field as string]: value }));
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
            expectRejected(buildManifestWithLanguage({ grammar }));
        });
    });

    describe('banks', () => {
        it.each([
            ['missing', undefined],
            ['empty', {}],
            ['null', null],
            ['an array', [{ path: 'python/easy.json', hash: VALID_HASH }]],
            ['a string', 'python/easy.json'],
        ])('rejects a banks value that is %s', (_description, banks) => {
            expectRejected(buildManifestWithBanks(banks));
        });

        it.each(['expert', 'Easy', 'EASY', '', 'beginner'])('rejects the unknown difficulty key %p', (difficulty) => {
            expectRejected(
                buildManifestWithBanks({
                    easy: { path: 'python/easy.json', hash: VALID_HASH },
                    [difficulty]: { path: 'python/other.json', hash: VALID_HASH },
                }),
            );
        });

        it.each([
            ['null', null],
            ['a string', 'python/easy.json'],
            ['missing its path', { hash: VALID_HASH }],
            ['missing its hash', { path: 'python/easy.json' }],
        ])('rejects a bank entry that is %s', (_description, bankEntry) => {
            expectRejected(buildManifestWithEasyBank(bankEntry));
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
            expectRejected(buildManifestWithEasyBank({ path: 'python/easy.json', hash }));
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
            expectRejected(buildManifestWithEasyBank({ path, hash: VALID_HASH }));
        });
    });
});
