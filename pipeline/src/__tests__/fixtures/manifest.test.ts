import { validateManifest } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { buildBankEntry, buildLanguage, buildManifest, HASH } from './manifest.js';

describe('manifest fixtures', () => {
    it('builds a manifest accepted by the content schema', () => {
        const manifest = buildManifest(buildLanguage({ banks: { easy: buildBankEntry('python/easy.json') } }));

        expect(validateManifest(manifest).isValid).toBe(true);
    });

    it('applies language overrides and extra keys while retaining other defaults', () => {
        const language = buildLanguage({ id: 'backend-security', glyph: 'BS', kind: 'topic' });

        expect(language).toEqual({
            banks: {},
            glyph: 'BS',
            grammar: 'plain',
            id: 'backend-security',
            kind: 'topic',
            label: 'L',
            misconceptions: [],
            tagline: 'T',
            topics: [],
        });
    });

    it('builds a bank entry with no access or product id', () => {
        expect(HASH).toBe('0123456789abcdef'.repeat(4));
        expect(buildBankEntry('python/medium.json')).toEqual({
            contentVersion: 1,
            hash: HASH,
            path: 'python/medium.json',
            topicCounts: {},
        });
    });

    it('preserves language order and sets schema version 2', () => {
        const python = buildLanguage();
        const javascript = buildLanguage({ id: 'javascript' });

        expect(buildManifest(python, javascript)).toEqual({
            languages: [python, javascript],
            schemaVersion: 2,
        });
    });
});
