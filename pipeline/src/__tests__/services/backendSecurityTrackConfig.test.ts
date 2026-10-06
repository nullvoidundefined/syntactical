// The Backend Security topic track as shipped: a manifest entry with kind 'topic' (so the menu
// lists it under Topics and gap-fill sends it to topic generation), grammar plain, ten topics,
// a free easy bank and two paid banks with their product ids, and a TRACK_RUNNERS entry.
import { readFileSync } from 'node:fs';

import { validateManifest } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { TRACK_RUNNERS } from '../../services/TRACK_RUNNERS.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../../../../content/manifest.json', import.meta.url), 'utf8'));
const ENTRY = MANIFEST.languages.find(({ id }: { id: string }) => id === 'backend-security');

describe('backend-security track config', () => {
    it("is a manifest entry with kind 'topic' and grammar plain", () => {
        expect(ENTRY).toMatchObject({
            grammar: 'plain',
            id: 'backend-security',
            kind: 'topic',
            label: 'Backend Security',
        });
    });

    it('lists the ten topics gap-fill fills to about 100 cards per bank', () => {
        expect(ENTRY.topics.map(({ id }: { id: string }) => id)).toEqual([
            'sql-injection',
            'command-injection',
            'path-traversal',
            'ssrf',
            'authentication',
            'sessions',
            'access-control',
            'deserialization',
            'cryptography',
            'input-validation',
        ]);
    });

    it('has a free easy bank and paid medium and hard banks with their product ids', () => {
        expect(ENTRY.banks.easy).toMatchObject({ access: 'free', path: 'backend-security/easy.json' });
        expect(ENTRY.banks.easy).not.toHaveProperty('productId');
        expect(ENTRY.banks.medium).toMatchObject({
            access: 'paid',
            path: 'backend-security/medium.json',
            productId: 'syntactical.backend-security.medium',
        });
        expect(ENTRY.banks.hard).toMatchObject({
            access: 'paid',
            path: 'backend-security/hard.json',
            productId: 'syntactical.backend-security.hard',
        });
    });

    it('keeps the whole manifest valid', () => {
        expect(validateManifest(MANIFEST).isValid).toBe(true);
    });

    it('has runners for gap-fill', () => {
        expect(TRACK_RUNNERS['backend-security']).toEqual(['python', 'node', 'postgres']);
    });
});
