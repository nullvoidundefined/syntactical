// B-7a: the one-time schema 1 to schema 2 manifest converter. It sets
// schemaVersion 2; each language gains empty topics and misconceptions lists;
// each bank entry keeps path and hash and gains access ('free' for easy,
// 'paid' otherwise), a productId `syntactical.<language>.<difficulty>` only
// when paid, contentVersion 1, and empty topicCounts. Input that is not a
// schema 1 manifest throws. The converted committed manifest must pass the
// real v2 validator.
import { readFileSync } from 'node:fs';

import { validateManifest } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { migrateManifestV1 } from '../../services/migrateManifestV1.js';

const COMMITTED_MANIFEST = new URL('../fixtures/v1-content/manifest.json', import.meta.url);

// Built at run time: a 64-character lowercase hex digest per bank.
function buildHash(seed: string): string {
    return seed.repeat(64 / seed.length);
}

type Fixture = Record<string, unknown>;

function buildManifestV1(): Fixture {
    return {
        schemaVersion: 1,
        languages: [
            {
                id: 'python',
                label: 'Python',
                glyph: 'PY',
                tagline: 'Runtime semantics, stdlib, and the sharp edges.',
                grammar: 'python',
                banks: {
                    easy: { path: 'python/easy.json', hash: buildHash('a1') },
                    medium: { path: 'python/medium.json', hash: buildHash('b2') },
                    hard: { path: 'python/hard.json', hash: buildHash('c3') },
                },
            },
            {
                id: 'postgres',
                label: 'Postgres',
                glyph: 'PG',
                tagline: 'Query planning, concurrency, and storage internals.',
                grammar: 'sql',
                banks: {
                    easy: { path: 'postgres/easy.json', hash: buildHash('d4') },
                    hard: { path: 'postgres/hard.json', hash: buildHash('e5') },
                },
            },
        ],
    };
}

function readCommittedManifest(): Fixture {
    return JSON.parse(readFileSync(COMMITTED_MANIFEST, 'utf8')) as Fixture;
}

describe('migrateManifestV1', () => {
    it('converts a representative v1 manifest to the exact v2 shape', () => {
        expect(migrateManifestV1(buildManifestV1())).toStrictEqual({
            schemaVersion: 2,
            languages: [
                {
                    id: 'python',
                    label: 'Python',
                    glyph: 'PY',
                    tagline: 'Runtime semantics, stdlib, and the sharp edges.',
                    grammar: 'python',
                    topics: [],
                    misconceptions: [],
                    banks: {
                        easy: {
                            path: 'python/easy.json',
                            hash: buildHash('a1'),
                            access: 'free',
                            contentVersion: 1,
                            topicCounts: {},
                        },
                        medium: {
                            path: 'python/medium.json',
                            hash: buildHash('b2'),
                            access: 'paid',
                            productId: 'syntactical.python.medium',
                            contentVersion: 1,
                            topicCounts: {},
                        },
                        hard: {
                            path: 'python/hard.json',
                            hash: buildHash('c3'),
                            access: 'paid',
                            productId: 'syntactical.python.hard',
                            contentVersion: 1,
                            topicCounts: {},
                        },
                    },
                },
                {
                    id: 'postgres',
                    label: 'Postgres',
                    glyph: 'PG',
                    tagline: 'Query planning, concurrency, and storage internals.',
                    grammar: 'sql',
                    topics: [],
                    misconceptions: [],
                    banks: {
                        easy: {
                            path: 'postgres/easy.json',
                            hash: buildHash('d4'),
                            access: 'free',
                            contentVersion: 1,
                            topicCounts: {},
                        },
                        hard: {
                            path: 'postgres/hard.json',
                            hash: buildHash('e5'),
                            access: 'paid',
                            productId: 'syntactical.postgres.hard',
                            contentVersion: 1,
                            topicCounts: {},
                        },
                    },
                },
            ],
        });
    });

    it('gives a free easy bank no productId key at all', () => {
        const converted = migrateManifestV1(buildManifestV1()) as {
            languages: { banks: Record<string, Fixture> }[];
        };

        expect('productId' in converted.languages[0].banks.easy).toBe(false);
    });

    it('produces a manifest the v2 validator accepts', () => {
        const result = validateManifest(migrateManifestV1(buildManifestV1()));

        expect(result).toMatchObject({ isValid: true });
    });

    it('converts the frozen v1 content/manifest.json to a valid v2 manifest with the same languages and bank paths', () => {
        const manifestV1 = readCommittedManifest() as {
            schemaVersion: number;
            languages: { id: string; banks: Record<string, { path: string; hash: string }> }[];
        };
        expect(manifestV1.schemaVersion).toBe(1);

        const result = validateManifest(migrateManifestV1(manifestV1));

        expect(result).toMatchObject({ isValid: true });
        if (!result.isValid) return;
        expect(result.manifest.languages.map((language) => language.id)).toEqual(
            manifestV1.languages.map((language) => language.id),
        );
        for (const [index, language] of result.manifest.languages.entries()) {
            const sourceBanks = manifestV1.languages[index].banks;
            expect(Object.keys(language.banks)).toEqual(Object.keys(sourceBanks));
            for (const [difficulty, bank] of Object.entries(language.banks)) {
                expect(bank?.path).toBe(sourceBanks[difficulty].path);
                expect(bank?.hash).toBe(sourceBanks[difficulty].hash);
                expect(bank?.access).toBe(difficulty === 'easy' ? 'free' : 'paid');
            }
        }
    });

    it('does not modify its input', () => {
        const input = buildManifestV1();
        const snapshot = structuredClone(input);

        migrateManifestV1(input);

        expect(input).toStrictEqual(snapshot);
    });

    it.each([
        ['null', null],
        ['an array', []],
        ['a string', 'schemaVersion: 1'],
        ['a manifest with no languages list', { schemaVersion: 1 }],
        ['a manifest whose languages is not a list', { schemaVersion: 1, languages: {} }],
        ['a manifest with no schemaVersion', { languages: (buildManifestV1().languages as unknown[]) }],
        ['a schema 2 manifest', { ...buildManifestV1(), schemaVersion: 2 }],
        ['a schema 3 manifest', { ...buildManifestV1(), schemaVersion: 3 }],
    ])('throws on %s', (_label, input) => {
        expect(() => migrateManifestV1(input)).toThrow();
    });

    it('throws on an already converted v2 manifest', () => {
        const converted = migrateManifestV1(buildManifestV1());

        expect(() => migrateManifestV1(converted)).toThrow();
    });
});
