// Strict pre-filter for a drafted Python oracle: the host python3 runs a fixed checker
// script that parses the program with `ast` and refuses anything outside a small grammar.
// Defense in depth only; the Docker runner sandbox is the enforced control. If the
// checker cannot run, the oracle is refused (fail closed).
import { fileURLToPath } from 'node:url';

import { createSpawnExec } from '../clients/createSpawnExec.js';
import type { ExecFn } from '../types/ExecFn.js';

const CHECKER_PATH = fileURLToPath(new URL('../../checkers/python_oracle_check.py', import.meta.url));
const CHECKER_TIMEOUT_MS = 10_000;
const MAX_CHECKER_OUTPUT_BYTES = 4096;
const UNAVAILABLE = 'python checker unavailable';

const defaultExec = createSpawnExec({ maxStdoutBytes: MAX_CHECKER_OUTPUT_BYTES, timeoutMs: CHECKER_TIMEOUT_MS });

// The refusal reason for a checker that could not give a verdict, with the cause for the log.
function unavailable(cause: unknown): string {
    return `${UNAVAILABLE} (${cause instanceof Error ? cause.message : String(cause)})`;
}

function readVerdict(stdout: string): string | null {
    let verdict: unknown;
    try {
        verdict = JSON.parse(stdout);
    } catch (error) {
        return unavailable(error);
    }
    const { ok, reason } = (verdict ?? {}) as { ok?: unknown; reason?: unknown };
    if (ok === true) {
        return null;
    }
    return ok === false && typeof reason === 'string' ? reason : unavailable('unexpected verdict');
}

// Returns the reason the program is refused, or null when it is inside the allowed grammar.
export async function checkPythonOracle(code: string, exec: ExecFn = defaultExec): Promise<string | null> {
    try {
        // -I: isolated mode (no user site, no PYTHON* environment, no script directory on the path).
        const { stdout } = await exec('python3', ['-I', '-B', CHECKER_PATH], {
            cwd: process.cwd(),
            env: { PATH: process.env.PATH ?? '' },
            input: code,
        });
        return readVerdict(stdout);
    } catch (error) {
        return unavailable(error);
    }
}
