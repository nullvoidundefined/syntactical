// B-5b: caps on manifest input fetched over the network. A topic id and a full
// misconception id (`<language>.<slug>`) are at most 64 characters, a language
// carries at most 20 topics and at most 40 misconceptions. Each cap is checked
// at its boundary: the limit is accepted and one past it is rejected with a
// rule naming the list at fault.
import { describe, expect, it } from 'vitest';

import { CONTENT_LIMITS } from '../contentLimits.js';
import { validateManifest } from '../validateManifest.js';

const REFERENCE_ID_LENGTH = 64;
const MAX_TOPICS = 20;
const MAX_MISCONCEPTIONS = 40;
const LANGUAGE_PREFIX = 'python.';

const VALID_HASH = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

type Fixture = Record<string, unknown>;

function buildFreeBank(difficulty: string): Fixture {
    return {
        path: `python/${difficulty}.json`,
        hash: VALID_HASH,
        access: 'free',
        contentVersion: 1,
        topicCounts: {},
    };
}

function buildPaidBank(difficulty: string): Fixture {
    return {
        path: `python/${difficulty}.json`,
        hash: VALID_HASH,
        access: 'paid',
        productId: `syntactical.python.${difficulty}`,
        contentVersion: 1,
        topicCounts: {},
    };
}

// One python language whose banks reference no topics, so the topic and
// misconception lists are the only possible source of a rejection.
function buildManifest(lists: { topics?: unknown[]; misconceptions?: unknown[] }): Fixture {
    return {
        schemaVersion: 2,
        languages: [
            {
                id: 'python',
                label: 'Python',
                glyph: 'PY',
                tagline: 'Runtime semantics, stdlib, and the sharp edges.',
                grammar: 'python',
                topics: lists.topics ?? [{ id: 'strings', label: 'Strings' }],
                misconceptions: lists.misconceptions ?? [
                    { id: 'python.off-by-one', description: 'Counts from one.' },
                ],
                banks: {
                    easy: buildFreeBank('easy'),
                    medium: buildPaidBank('medium'),
                    hard: buildPaidBank('hard'),
                },
            },
        ],
    };
}

function buildTopics(count: number): Fixture[] {
    return Array.from({ length: count }, (_unused, index) => ({
        id: `topic-${index}`,
        label: `Topic ${index}`,
    }));
}

function buildMisconceptions(count: number): Fixture[] {
    return Array.from({ length: count }, (_unused, index) => ({
        id: `${LANGUAGE_PREFIX}belief-${index}`,
        description: `Wrong belief ${index}.`,
    }));
}

// A valid kebab-case slug of exactly `length` characters.
function buildSlug(length: number): string {
    return 'a'.repeat(length);
}

function expectAccepted(input: unknown): void {
    expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
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

describe('validateManifest caps on network input', () => {
    it('exposes the caps in CONTENT_LIMITS', () => {
        expect(CONTENT_LIMITS).toMatchObject({
            referenceIdLength: REFERENCE_ID_LENGTH,
            maxTopics: MAX_TOPICS,
            maxMisconceptions: MAX_MISCONCEPTIONS,
        });
    });

    it('accepts a 64-character topic id and rejects a 65-character one', () => {
        const atLimit = buildSlug(REFERENCE_ID_LENGTH);
        const pastLimit = buildSlug(REFERENCE_ID_LENGTH + 1);
        expectAccepted(buildManifest({ topics: [{ id: atLimit, label: 'Long' }] }));
        expectRejectedAt(
            buildManifest({ topics: [{ id: pastLimit, label: 'Long' }] }),
            'languages[0].topics',
        );
    });

    it('rejects a very long topic id', () => {
        expectRejectedAt(
            buildManifest({ topics: [{ id: buildSlug(10_000), label: 'Long' }] }),
            'languages[0].topics',
        );
    });

    it('counts the language prefix: accepts a 64-character misconception id and rejects a 65-character one', () => {
        const atLimit = LANGUAGE_PREFIX + buildSlug(REFERENCE_ID_LENGTH - LANGUAGE_PREFIX.length);
        const pastLimit =
            LANGUAGE_PREFIX + buildSlug(REFERENCE_ID_LENGTH - LANGUAGE_PREFIX.length + 1);
        expect(atLimit).toHaveLength(REFERENCE_ID_LENGTH);
        expect(pastLimit).toHaveLength(REFERENCE_ID_LENGTH + 1);
        expectAccepted(
            buildManifest({ misconceptions: [{ id: atLimit, description: 'Long id.' }] }),
        );
        expectRejectedAt(
            buildManifest({ misconceptions: [{ id: pastLimit, description: 'Long id.' }] }),
            'languages[0].misconceptions',
        );
    });

    it('rejects a very long misconception id', () => {
        expectRejectedAt(
            buildManifest({
                misconceptions: [
                    { id: LANGUAGE_PREFIX + buildSlug(10_000), description: 'Long id.' },
                ],
            }),
            'languages[0].misconceptions',
        );
    });

    it('accepts 20 topics in one language and rejects 21', () => {
        expectAccepted(buildManifest({ topics: buildTopics(MAX_TOPICS) }));
        expectRejectedAt(
            buildManifest({ topics: buildTopics(MAX_TOPICS + 1) }),
            'languages[0].topics',
        );
    });

    it('rejects a very large topic list', () => {
        expectRejectedAt(buildManifest({ topics: buildTopics(5_000) }), 'languages[0].topics');
    });

    it('accepts 40 misconceptions in one language and rejects 41', () => {
        expectAccepted(buildManifest({ misconceptions: buildMisconceptions(MAX_MISCONCEPTIONS) }));
        expectRejectedAt(
            buildManifest({ misconceptions: buildMisconceptions(MAX_MISCONCEPTIONS + 1) }),
            'languages[0].misconceptions',
        );
    });

    it('rejects a very large misconception list', () => {
        expectRejectedAt(
            buildManifest({ misconceptions: buildMisconceptions(5_000) }),
            'languages[0].misconceptions',
        );
    });
});
