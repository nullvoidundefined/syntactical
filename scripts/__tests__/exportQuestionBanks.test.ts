import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportQuestionBanks } from '../exportQuestionBanks.mjs';
import { getQuestionBank } from '../../src/data/index.js';

const LANGUAGE_IDS = ['python', 'postgres', 'javascript'];
const DIFFICULTY_IDS = ['easy', 'medium', 'hard'];

const EXPECTED_MANIFEST_LANGUAGES = [
    {
        id: 'python',
        label: 'Python',
        glyph: 'PY',
        tagline: 'Runtime semantics, stdlib, and the sharp edges.',
        grammar: 'python',
    },
    {
        id: 'postgres',
        label: 'Postgres',
        glyph: 'PG',
        tagline: 'Query planning, concurrency, and storage internals.',
        grammar: 'sql',
    },
    {
        id: 'javascript',
        label: 'JavaScript',
        glyph: 'JS',
        tagline: 'Coercion, scope, and the runtime behavior that surprises.',
        grammar: 'javascript',
    },
];

async function readJsonFile(filePath: string) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

describe('exportQuestionBanks', () => {
    let contentDir: string;

    beforeAll(async () => {
        contentDir = await mkdtemp(join(tmpdir(), 'content-export-'));
        await exportQuestionBanks(contentDir);
    });

    afterAll(async () => {
        await rm(contentDir, { recursive: true, force: true });
    });

    for (const language of LANGUAGE_IDS) {
        for (const difficulty of DIFFICULTY_IDS) {
            it(`writes ${language}/${difficulty}.json with questions equal to the source bank`, async () => {
                const sourceQuestions = getQuestionBank(language, difficulty);
                expect(sourceQuestions.length).toBeGreaterThan(0);

                const bankFile = await readJsonFile(join(contentDir, language, `${difficulty}.json`));

                expect(Object.keys(bankFile).sort()).toEqual(['questions', 'schemaVersion']);
                expect(bankFile.schemaVersion).toBe(1);
                expect(bankFile.questions).toEqual(sourceQuestions);
            });
        }
    }

    it('writes manifest.json listing the three languages in order with grammar and empty-hash banks', async () => {
        const manifest = await readJsonFile(join(contentDir, 'manifest.json'));

        const expectedLanguages = EXPECTED_MANIFEST_LANGUAGES.map((language) => ({
            ...language,
            banks: {
                easy: { path: `${language.id}/easy.json`, hash: '' },
                medium: { path: `${language.id}/medium.json`, hash: '' },
                hard: { path: `${language.id}/hard.json`, hash: '' },
            },
        }));

        expect(manifest).toEqual({ schemaVersion: 1, languages: expectedLanguages });
    });

});
