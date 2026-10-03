// `pipeline draft-oracles`: drafts an oracle for every question in each FREE bank and
// writes `<oraclesDir>/<language>/<difficulty>.json` (question id to oracle). Paid
// banks are skipped, and content files are only read, never written.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Manifest, Question } from '@syntactical/content-schema';

import { draftOracle } from '../services/draftOracle.js';
import { ModelOutputInvalid } from '../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { Oracle } from '../types/Oracle.js';
import type { OracleLanguage } from '../types/OracleLanguage.js';

export interface DraftOraclesOptions {
    contentDir: string;
    oraclesDir: string;
    provider: ModelProvider;
    log: (line: string) => void;
}

const ORACLE_LANGUAGES: Record<string, OracleLanguage> = {
    javascript: 'node',
    postgres: 'postgres',
    python: 'python',
};

const JSON_INDENT = 2;

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

export async function draftOracles(options: DraftOraclesOptions): Promise<void> {
    const { contentDir, log, oraclesDir, provider } = options;
    const manifest = (await readJson(join(contentDir, 'manifest.json'))) as Manifest;
    for (const { banks, id: languageId } of manifest.languages) {
        const language = ORACLE_LANGUAGES[languageId];
        for (const [difficulty, { access, path }] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            if (access !== 'free') {
                log(`skipping paid bank ${bankKey}`);
                continue;
            }
            if (!language) {
                log(`skipping bank ${bankKey}: no oracle runner for language ${languageId}`);
                continue;
            }
            const bank = (await readJson(join(contentDir, path))) as { questions: Question[] };
            const oracles: Record<string, Oracle> = {};
            for (const question of bank.questions) {
                try {
                    const drafted = await draftOracle(question, language, provider);
                    if ('isExecutable' in drafted) {
                        log(`${bankKey} ${question.id}: not executable (${drafted.reason})`);
                    } else {
                        oracles[question.id] = drafted;
                    }
                } catch (error) {
                    if (!(error instanceof ModelOutputInvalid)) {
                        throw error;
                    }
                    log(`${bankKey} ${question.id}: model output invalid (${error.message})`);
                }
            }
            const file = join(oraclesDir, `${bankKey}.json`);
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, `${JSON.stringify(oracles, null, JSON_INDENT)}\n`);
            log(`${bankKey}: ${Object.keys(oracles).length} of ${bank.questions.length} oracles written`);
        }
    }
}
