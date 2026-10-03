// ModelProvider over `claude -p`. The command runs as an argument vector (never
// a shell string), so the system and user prompts reach the CLI as single
// arguments whatever characters they hold.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ModelProvider } from '../types/ModelProvider.js';
import { generateWithRetries } from './generateWithRetries.js';

const FALLBACK_MODEL = 'claude-cli';
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
    } catch {
        return { model: FALLBACK_MODEL, text: stdout };
    }
    if (typeof envelope !== 'object' || envelope === null) {
        return { model: FALLBACK_MODEL, text: stdout };
    }
    const { model, result } = envelope as { model?: unknown; result?: unknown };
    return {
        model: typeof model === 'string' ? model : FALLBACK_MODEL,
        text: typeof result === 'string' ? result : stdout,
    };
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
                    '--system-prompt',
                    system,
                    prompt,
                ]);
                return readEnvelope(stdout);
            });
        },
    };
}
