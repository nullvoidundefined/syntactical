// `pipeline draft-oracles`: drafts an oracle for every question in each FREE bank and
// writes `<oraclesDir>/<language>/<difficulty>.json` (question id to oracle). Paid
// banks are skipped, and content files are only read, never written.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

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

// An existing oracle file is data worth keeping: a rerun adds to it, and a file
// that cannot be parsed stops the run instead of being overwritten.
async function readExistingOracles(file: string): Promise<Record<string, Oracle>> {
    try {
        return (await readJson(file)) as Record<string, Oracle>;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

interface SaveBankArgs {
    bankKey: string;
    file: string;
    log: (line: string) => void;
    oracles: Record<string, Oracle>;
    total: number;
}

async function saveBank(args: SaveBankArgs): Promise<void> {
    const { bankKey, file, log, oracles, total } = args;
    const draftedCount = Object.keys(oracles).length;
    if (draftedCount === 0) {
        log(`${bankKey}: nothing drafted, existing file left as is`);
        return;
    }
    // Merge into what is already there: a rerun never deletes an oracle it did not redraft.
    const merged = { ...(await readExistingOracles(file)), ...oracles };
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(merged, null, JSON_INDENT)}\n`);
    log(`${bankKey}: ${draftedCount} of ${total} oracles drafted, ${Object.keys(merged).length} in file`);
}

export async function draftOracles(options: DraftOraclesOptions): Promise<void> {
    const { contentDir, log, oraclesDir, provider } = options;
    // The manifest is untrusted: its language ids, difficulty keys, and bank paths are
    // joined into file paths below, so nothing is read or written before it validates
    // (id charset, known difficulties, safe bank paths).
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if (!checked.isValid) {
        throw new Error(`Manifest rejected: ${checked.rule}`);
    }
    for (const { banks, id: languageId } of checked.manifest.languages) {
        const language = Object.hasOwn(ORACLE_LANGUAGES, languageId) ? ORACLE_LANGUAGES[languageId] : undefined;
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
            const file = join(oraclesDir, `${bankKey}.json`);
            const oracles: Record<string, Oracle> = {};
            try {
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
            } finally {
                // An error that stops the run still saves what this bank drafted so far.
                await saveBank({ bankKey, file, log, oracles, total: bank.questions.length });
            }
        }
    }
}
