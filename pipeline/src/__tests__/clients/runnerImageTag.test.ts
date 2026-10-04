// B-8d: the runner image tag is derived from a hash of the runner build
// context, so an edited Dockerfile or harness can never reuse a stale image.
// `runnerImageTag(language)` returns
// `syntactical-runner-<language>:<first 12 hex chars of hashRunnerContext(runners/<language>)>`.
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hashRunnerContext } from '../../clients/hashRunnerContext.js';
import { runnerImageTag } from '../../clients/runnerImageTag.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';

const TAG_HASH_LENGTH = 12;
const LANGUAGES: OracleLanguage[] = ['python', 'node', 'postgres', 'ruby', 'rails', 'go'];
const TAG_PATTERN = /^syntactical-runner-(python|node|postgres|ruby|rails|go):[0-9a-f]{12}$/;

function runnerContextDir(language: OracleLanguage): string {
    return fileURLToPath(new URL(`../../../runners/${language}`, import.meta.url));
}

describe('runnerImageTag', () => {
    it.each(LANGUAGES)('returns a content-hash tag for %s', (language) => {
        const tag = runnerImageTag(language);

        expect(tag).toMatch(TAG_PATTERN);
        expect(tag.startsWith(`syntactical-runner-${language}:`)).toBe(true);
    });

    it.each(LANGUAGES)('tags %s with the prefix of its runner context hash', (language) => {
        const hashPrefix = hashRunnerContext(runnerContextDir(language)).slice(0, TAG_HASH_LENGTH);

        expect(runnerImageTag(language)).toBe(`syntactical-runner-${language}:${hashPrefix}`);
    });

    it('gives each language a distinct tag and hash', () => {
        const tags = LANGUAGES.map((language) => runnerImageTag(language));
        const hashes = tags.map((tag) => tag.split(':')[1]);

        expect(new Set(tags).size).toBe(LANGUAGES.length);
        expect(new Set(hashes).size).toBe(LANGUAGES.length);
    });

    it('is stable across calls', () => {
        for (const language of LANGUAGES) {
            expect(runnerImageTag(language)).toBe(runnerImageTag(language));
        }
    });
});
