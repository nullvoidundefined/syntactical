// Go track: the content id `go` maps to its own oracle runner, an oracle file in Go
// reads back, and pipeline/topics.json gives Go the shared language topic list.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import { readFallbackTopics } from '../../services/classify/readFallbackTopics.js';
import { readExistingOracles } from '../../services/readExistingOracles.js';

const TOPICS_FILE = fileURLToPath(new URL('../../../topics.json', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));
const CODE = 'package main\nimport "fmt"\nfunc main() { fmt.Println(1) }';

describe('go oracle language', () => {
    it('maps the go content id to its own runner', () => {
        expect(ORACLE_LANGUAGES.go).toBe('go');
    });

    it('reads back an oracle file holding a go oracle', async () => {
        const directory = mkdtempSync(join(FIXTURES_DIR, 'go-oracles-'));
        const file = join(directory, 'go.json');
        try {
            writeFileSync(file, JSON.stringify({ 'go-1': { code: CODE, language: 'go' } }));

            const oracles = await readExistingOracles(file);

            expect(oracles.get('go-1')).toEqual({ code: CODE, language: 'go' });
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

describe('go fallback topics', () => {
    it('gives go the shared language topics', async () => {
        const topics = await readFallbackTopics(TOPICS_FILE);

        expect(topics).toHaveProperty('go');
        expect(topics.go).toEqual(topics.python);
    });
});
