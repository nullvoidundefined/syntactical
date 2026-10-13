import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { readExistingOracles } from '../../services/readExistingOracles.js';
import { ORACLE_LANGUAGE_IDS, type OracleLanguage } from '../../types/OracleLanguage.js';
import type { OracleRun } from '../../types/OracleRun.js';

describe('oracle language ids', () => {
    it('exports the ordered readonly tuple and its language union', () => {
        const expected = ['python', 'node', 'postgres', 'ruby', 'rails', 'go', 'jsdom', 'typescript'] as const;

        expect(ORACLE_LANGUAGE_IDS).toStrictEqual(expected);
        expectTypeOf<typeof ORACLE_LANGUAGE_IDS>().toEqualTypeOf<typeof expected>();
        expectTypeOf<OracleLanguage>().toEqualTypeOf<(typeof ORACLE_LANGUAGE_IDS)[number]>();
    });

    it('matches the runner directories in both directions', () => {
        const directories = readdirSync(new URL('../../../runners', import.meta.url), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

        expect(directories.sort()).toStrictEqual([...ORACLE_LANGUAGE_IDS].sort());
    });

    it('has a golden file for every runner id', () => {
        for (const language of ORACLE_LANGUAGE_IDS) {
            expect(existsSync(new URL(`../../../golden/${language}.json`, import.meta.url)), language).toBe(true);
        }
    });

    it('reads an existing oracle for every runner id', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'oracle-language-ids-'));
        try {
            for (const language of ORACLE_LANGUAGE_IDS) {
                const file = join(directory, `${language}.json`);
                const oracle = { code: '', language };
                writeFileSync(file, JSON.stringify({ question: oracle }));

                expect(await readExistingOracles(file)).toStrictEqual(new Map([['question', oracle]]));
            }
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('has at least ten TypeScript golden entries, half wrong, with the pinned runner version', () => {
        const entries = JSON.parse(
            readFileSync(new URL('../../../golden/typescript.json', import.meta.url), 'utf8'),
        ) as {
            expected: { reason?: string };
            fakeRun: OracleRun;
        }[];

        expect(entries.length).toBeGreaterThanOrEqual(10);
        expect(
            entries.filter((entry) => entry.expected.reason === 'answer-mismatch').length * 2,
        ).toBeGreaterThanOrEqual(entries.length);
        for (const entry of entries) {
            expect(entry.fakeRun.runtimeVersion).toBe('TypeScript 5.9.3 (Node v24.21.0)');
        }
    });
});
