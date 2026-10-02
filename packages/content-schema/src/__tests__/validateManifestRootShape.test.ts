// Whole-manifest rejections that hold unchanged from schema 1 to schema 2: the
// root shape, a languages value that is not an array, and every schemaVersion
// that is neither the old version nor the supported one.
import { describe, expect, it } from 'vitest';

import { validateManifest } from '../validateManifest.js';

function buildManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { schemaVersion: 2, languages: [], ...overrides };
}

function expectRejected(input: unknown): void {
    const result = validateManifest(input);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
        expect(typeof result.rule).toBe('string');
        expect(result.rule.length).toBeGreaterThan(0);
    }
}

describe('validateManifest rejects the whole manifest', () => {
    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a string', 'manifest'],
        ['a number', 1],
        ['an array', [buildManifest()]],
    ])('rejects a root that is %s', (_description, input) => {
        expectRejected(input);
    });

    it.each([
        ['missing', undefined],
        ['an object', { python: {} }],
        ['a string', 'python'],
    ])('rejects a languages value that is %s', (_description, languages) => {
        expectRejected(buildManifest({ languages }));
    });

    it.each([
        ['missing', undefined],
        ['newer than supported', 3],
        ['zero', 0],
        ['a non-integer', 1.5],
        ['a numeric string', '2'],
        ['null', null],
    ])('rejects a schemaVersion that is %s', (_description, schemaVersion) => {
        expectRejected(buildManifest({ schemaVersion }));
    });
});
