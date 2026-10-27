// The Frontend Security topic track as shipped: a manifest entry with kind 'topic' (so the menu
// lists it under Topics and gap-fill sends it to topic generation), grammar plain, ten topics,
// easy, medium, and hard banks under content/ with no access or product id, and a TRACK_RUNNERS entry.
import { readFileSync } from 'node:fs';

import { validateManifest } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { TRACK_RUNNERS } from '../../services/TRACK_RUNNERS.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../../../../content/manifest.json', import.meta.url), 'utf8'));
const ENTRY = MANIFEST.languages.find(({ id }: { id: string }) => id === 'frontend-security');

describe('frontend-security track config', () => {
    it("is a manifest entry with kind 'topic' and grammar plain", () => {
        expect(ENTRY).toMatchObject({
            grammar: 'plain',
            id: 'frontend-security',
            kind: 'topic',
            label: 'Frontend Security',
        });
    });

    it('lists the ten topics gap-fill fills to about 100 cards per bank', () => {
        expect(ENTRY.topics.map(({ id }: { id: string }) => id)).toEqual([
            'dom-xss',
            'html-sanitization',
            'url-handling',
            'postmessage',
            'prototype-pollution',
            'open-redirect',
            'csp',
            'cookies',
            'cors',
            'framing',
        ]);
    });

    it('has easy, medium, and hard banks under content/, none carrying access or productId', () => {
        for (const difficulty of ['easy', 'medium', 'hard']) {
            expect(ENTRY.banks[difficulty]).toMatchObject({ path: `frontend-security/${difficulty}.json` });
            expect(ENTRY.banks[difficulty]).not.toHaveProperty('access');
            expect(ENTRY.banks[difficulty]).not.toHaveProperty('productId');
        }
    });

    it('keeps the whole manifest valid', () => {
        expect(validateManifest(MANIFEST).isValid).toBe(true);
    });

    it('has runners for gap-fill', () => {
        expect(TRACK_RUNNERS['frontend-security']).toEqual(['jsdom', 'node']);
    });
});
