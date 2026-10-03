// `pipeline draft-oracles`: drafts an oracle for every question in each FREE bank and
// writes `<oraclesDir>/<language>/<difficulty>.json` (question id to oracle). Paid
// banks are skipped, and content files are only read, never written.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type Question, validateManifest } from '@syntactical/content-schema';

import { draftOracle } from '../services/draftOracle.js';
import { findRefusedConstruct } from '../services/findRefusedConstruct.js';
import { readExistingOracles } from '../services/readExistingOracles.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';
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

interface SaveBankArgs {
    bankKey: string;
    dropped: number;
    file: string;
    kept: Map<string, Oracle>;
    log: (line: string) => void;
    oracles: Map<string, Oracle>;
    total: number;
}

async function saveBank(args: SaveBankArgs): Promise<void> {
    const { bankKey, dropped, file, kept, log, oracles, total } = args;
    if (oracles.size === 0 && dropped === 0) {
        log(`${bankKey}: nothing drafted, existing file left as is`);
        return;
    }
    // Merge into what is already there: a rerun never deletes an oracle it did not redraft.
    // Maps keep a question id such as `__proto__` as a plain key; Object.fromEntries defines own properties.
    const merged = new Map([...kept, ...oracles]);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(Object.fromEntries(merged), null, JSON_INDENT)}\n`);
    log(`${bankKey}: ${oracles.size} of ${total} oracles drafted, ${merged.size} in file`);
}

// Entries already on disk went through an older check; run the current one and drop what fails.
function dropRefused(saved: Map<string, Oracle>, bankKey: string, log: (line: string) => void): number {
    let dropped = 0;
    for (const [id, oracle] of saved) {
        const refused = findRefusedConstruct(oracle);
        if (refused) {
            saved.delete(id);
            dropped += 1;
            log(`${bankKey} ${id}: dropped saved oracle (refused: ${refused})`);
        }
    }
    return dropped;
}

export async function draftOracles(options: DraftOraclesOptions): Promise<void> {
    const { contentDir, oraclesDir, provider } = options;
    // Model text and content ids reach the log; keep each entry to one clean line.
    const log = (line: string): void => options.log(sanitizeLogText(line));
    // The manifest is untrusted: its language ids, difficulty keys, and bank paths are
    // joined into file paths below, so nothing is read or written before it validates
    // (id charset, known difficulties, safe bank paths).
    const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${checked.rule}`);
    }
    const { manifest } = checked;
    for (const { banks, id: languageId } of manifest.languages) {
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
            // Read the saved file before drafting anything, so a bad file fails fast.
            const kept = await readExistingOracles(file);
            const dropped = dropRefused(kept, bankKey, log);
            const oracles = new Map<string, Oracle>();
            try {
                for (const question of bank.questions) {
                    try {
                        const drafted = await draftOracle(question, language, provider);
                        if ('isExecutable' in drafted) {
                            log(`${bankKey} ${question.id}: not executable (${drafted.reason})`);
                        } else {
                            oracles.set(question.id, drafted);
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
                await saveBank({ bankKey, dropped, file, kept, log, oracles, total: bank.questions.length });
            }
        }
    }
}
