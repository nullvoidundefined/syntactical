// jsdom is a registered runner: an oracle file naming it reads back, its cards get the
// javascript grammar, and Frontend Security may use jsdom and node.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RUNNER_GRAMMARS } from '../../services/RUNNER_GRAMMARS.js';
import { TRACK_RUNNERS } from '../../services/TRACK_RUNNERS.js';
import { readExistingOracles } from '../../services/readExistingOracles.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));
const JSDOM = 'jsdom' as OracleLanguage;

describe('jsdom registration', () => {
    it('reads back an oracle file holding a jsdom oracle', async () => {
        const directory = mkdtempSync(join(FIXTURES_DIR, 'jsdom-oracles-'));
        const file = join(directory, 'jsdom.json');
        try {
            writeFileSync(file, JSON.stringify({ 'fe-1': { code: 'console.log(1)', language: 'jsdom' } }));

            const oracles = await readExistingOracles(file);

            expect(oracles.get('fe-1')).toEqual({ code: 'console.log(1)', language: 'jsdom' });
        } finally {
            rmSync(directory, { force: true, recursive: true });
        }
    });

    it('still rejects an oracle file naming an unknown runner', async () => {
        const directory = mkdtempSync(join(FIXTURES_DIR, 'jsdom-oracles-'));
        const file = join(directory, 'bad.json');
        try {
            writeFileSync(file, JSON.stringify({ 'fe-1': { code: 'x', language: 'jsdom-evil' } }));

            await expect(readExistingOracles(file)).rejects.toThrow();
        } finally {
            rmSync(directory, { force: true, recursive: true });
        }
    });

    it('gives jsdom cards the javascript grammar', () => {
        expect(RUNNER_GRAMMARS[JSDOM]).toBe('javascript');
    });

    it('lets frontend-security use jsdom and node', () => {
        expect(TRACK_RUNNERS['frontend-security']).toEqual(['jsdom', 'node']);
    });

    it('keeps backend-security unchanged', () => {
        expect(TRACK_RUNNERS['backend-security']).toEqual(['python', 'node', 'postgres']);
    });
});
