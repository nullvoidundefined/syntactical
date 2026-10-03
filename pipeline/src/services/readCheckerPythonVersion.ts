// Asks the Python oracle checker which interpreter version it runs under, so a run's log
// records it (CI pins 3.13 to match the runner image; a local python3 can differ).
import { fileURLToPath } from 'node:url';

import { createSpawnExec } from '../clients/createSpawnExec.js';
import type { ExecFn } from '../types/ExecFn.js';

const CHECKER_PATH = fileURLToPath(new URL('../../checkers/python_oracle_check.py', import.meta.url));
const VERSION_TIMEOUT_MS = 10_000;
const MAX_VERSION_OUTPUT_BYTES = 256;

const defaultExec = createSpawnExec({ maxStdoutBytes: MAX_VERSION_OUTPUT_BYTES, timeoutMs: VERSION_TIMEOUT_MS });

export async function readCheckerPythonVersion(exec: ExecFn = defaultExec): Promise<string> {
    try {
        const { stdout } = await exec('python3', ['-I', '-B', CHECKER_PATH, '--version'], {
            cwd: process.cwd(),
            env: { PATH: process.env.PATH ?? '' },
            input: '',
        });
        return stdout.trim();
    } catch (error) {
        return `unavailable (${error instanceof Error ? error.message : String(error)})`;
    }
}
