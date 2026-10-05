// ModelProvider over `codex exec`, the second blind answer of the judged route. Codex runs with a
// read-only sandbox in an empty scratch directory, with a minimal environment and stdin closed.
// The system text and prompt travel as one argument after `--`, so no prompt text is read as an
// option. The answer is read from the last-message file. A missing or logged-out CLI is a
// transport error that stops the run; it is never a disagreement.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExecFn } from '../types/ExecFn.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import { ProviderTransientError } from '../types/ProviderTransientError.js';

import { createSpawnExec } from './createSpawnExec.js';
import { generateWithRetries } from './generateWithRetries.js';

export const CODEX_MODEL_LABEL = 'codex-cli';
const KIBIBYTE = 1024;
const MAX_STDOUT_BYTES = 32 * KIBIBYTE * KIBIBYTE;
const CODEX_TIMEOUT_MS = 300_000;
const PASSED_ENV_NAMES = ['HOME', 'LANG', 'PATH', 'TMPDIR', 'USER'];
const PASSED_ENV_PREFIX = 'CODEX_';
const NOT_READY = 'Codex CLI is not installed or not logged in: run `codex login`';

const defaultExec = createSpawnExec({ maxStdoutBytes: MAX_STDOUT_BYTES, timeoutMs: CODEX_TIMEOUT_MS });

export function buildCodexEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(source)) {
        if (value !== undefined && (PASSED_ENV_NAMES.includes(name) || name.startsWith(PASSED_ENV_PREFIX)))
            env[name] = value;
    }
    return env;
}

export function createCodexCliProvider(exec: ExecFn = defaultExec): ModelProvider {
    return {
        generate(request) {
            const { prompt, system } = request;
            return generateWithRetries(request, async () => {
                const cwd = mkdtempSync(join(tmpdir(), 'syntactical-codex-'));
                const lastMessage = join(cwd, 'last-message.txt');
                try {
                    await exec(
                        'codex',
                        [
                            'exec',
                            '-s',
                            'read-only',
                            '--skip-git-repo-check',
                            '--color',
                            'never',
                            '-C',
                            cwd,
                            '--output-last-message',
                            lastMessage,
                            '--',
                            `${system}\n\n${prompt}`,
                        ],
                        { cwd, env: buildCodexEnv(process.env), input: '' },
                    );
                    return { model: CODEX_MODEL_LABEL, text: readFileSync(lastMessage, 'utf8') };
                } catch (error) {
                    // A timeout or non-zero exit on one card stays transient: gap-fill drops that card
                    // and stops on its own after a streak. Only a CLI that cannot start ends the run.
                    if (error instanceof ProviderTransientError) {
                        throw error;
                    }
                    throw new Error(
                        `codex CLI failed (${(error as Error).message}); install it and run \`codex login\``,
                        {
                            cause: error,
                        },
                    );
                } finally {
                    rmSync(cwd, { force: true, recursive: true });
                }
            });
        },
    };
}

export async function assertCodexReady(exec: ExecFn = defaultExec): Promise<void> {
    const cwd = mkdtempSync(join(tmpdir(), 'syntactical-codex-'));
    try {
        await exec('codex', ['login', 'status'], { cwd, env: buildCodexEnv(process.env), input: '' });
    } catch (error) {
        throw new Error(NOT_READY, { cause: error });
    } finally {
        rmSync(cwd, { force: true, recursive: true });
    }
}
