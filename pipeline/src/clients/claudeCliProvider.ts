// ModelProvider over `claude -p`. The command runs as an argument vector (never
// a shell string). The system prompt is bound to its flag with `=` and the user
// prompt follows a `--` terminator, so neither can be parsed as a CLI option even
// when it starts with a dash.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ModelProvider } from '../types/ModelProvider.js';
import { generateWithRetries } from './generateWithRetries.js';

const UNKNOWN_MODEL = 'unknown';
const MAX_STDOUT_BYTES = 32 * 1024 * 1024;

export type ExecFn = (file: string, args: string[]) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);

function defaultExec(file: string, args: string[]): Promise<{ stdout: string }> {
    return execFileAsync(file, args, { maxBuffer: MAX_STDOUT_BYTES });
}

function readEnvelope(stdout: string): { model: string; text: string } {
    let envelope: unknown;
    try {
        envelope = JSON.parse(stdout);
    } catch (error) {
        throw new Error('claude CLI printed output that is not a JSON envelope', { cause: error });
    }
    if (typeof envelope !== 'object' || envelope === null) {
        throw new Error('claude CLI printed output that is not a JSON envelope');
    }
    const { is_error: isError, model, result, subtype } = envelope as Record<string, unknown>;
    if (isError === true) {
        throw new Error(`claude CLI reported an error (${typeof subtype === 'string' ? subtype : 'unknown'})`);
    }
    if (typeof result !== 'string') {
        throw new Error('claude CLI envelope has no result text');
    }
    return { model: typeof model === 'string' ? model : UNKNOWN_MODEL, text: result };
}

export function createClaudeCliProvider(exec: ExecFn = defaultExec): ModelProvider {
    return {
        generate(request) {
            const { prompt, system } = request;
            return generateWithRetries(request, async () => {
                const { stdout } = await exec('claude', [
                    '-p',
                    '--output-format',
                    'json',
                    `--system-prompt=${system}`,
                    '--',
                    prompt,
                ]);
                return readEnvelope(stdout);
            });
        },
    };
}
