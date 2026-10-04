// ModelProvider over `claude -p`. The model only completes text, so the CLI runs
// with every built-in tool and MCP server turned off, in an empty scratch
// directory, with a minimal environment: a prompt drawn from content cannot make
// it read, run, or fetch anything, and no settings file (user, project, or local)
// loads, so neither hooks nor CLAUDE.md see the prompt or shape the answer. The prompt travels on stdin, so no prompt text
// can be parsed as a CLI option or subcommand; the system prompt is bound to its
// flag with `=`.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExecFn } from '../types/ExecFn.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import { ProviderTransientError } from '../types/ProviderTransientError.js';
import { createSpawnExec } from './createSpawnExec.js';
import { generateWithRetries } from './generateWithRetries.js';

const UNKNOWN_MODEL = 'unknown';
const KIBIBYTE = 1024;
const MAX_STDOUT_MEBIBYTES = 32;
const MAX_STDOUT_BYTES = MAX_STDOUT_MEBIBYTES * KIBIBYTE * KIBIBYTE;
const CLI_TIMEOUT_MS = 300_000;
const PASSED_ENV_NAMES = ['HOME', 'LANG', 'PATH', 'TMPDIR', 'USER'];
const PASSED_ENV_PREFIXES = ['ANTHROPIC_', 'CLAUDE_'];

export function buildCliEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(source)) {
        const isPassed =
            PASSED_ENV_NAMES.includes(name) || PASSED_ENV_PREFIXES.some((prefix) => name.startsWith(prefix));
        if (isPassed && value !== undefined) {
            env[name] = value;
        }
    }
    return env;
}

const defaultExec = createSpawnExec({ maxStdoutBytes: MAX_STDOUT_BYTES, timeoutMs: CLI_TIMEOUT_MS });

function readModel(model: unknown, modelUsage: unknown): string {
    if (typeof model === 'string') {
        return model;
    }
    if (typeof modelUsage === 'object' && modelUsage !== null) {
        const [first] = Object.keys(modelUsage);
        if (first !== undefined) {
            return first;
        }
    }
    return UNKNOWN_MODEL;
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
    const { is_error: isError, model, modelUsage, result, subtype } = envelope as Record<string, unknown>;
    if (isError === true) {
        throw new Error(`claude CLI reported an error (${typeof subtype === 'string' ? subtype : 'unknown'})`);
    }
    if (typeof result !== 'string') {
        throw new Error('claude CLI envelope has no result text');
    }
    return { model: readModel(model, modelUsage), text: result };
}

// A non-zero exit is transient unless the CLI printed an error envelope: then it reported
// the failure itself (auth, billing), which retrying will not fix, so it stays fatal.
function hasErrorEnvelope(stdout: string): boolean {
    try {
        const envelope: unknown = JSON.parse(stdout);
        return (
            typeof envelope === 'object' && envelope !== null && (envelope as Record<string, unknown>).is_error === true
        );
    } catch {
        return false;
    }
}

export function createClaudeCliProvider(exec: ExecFn = defaultExec): ModelProvider {
    return {
        generate(request) {
            const { prompt, system } = request;
            return generateWithRetries(request, async () => {
                const cwd = mkdtempSync(join(tmpdir(), 'syntactical-model-'));
                let stdout: string;
                try {
                    ({ stdout } = await exec(
                        'claude',
                        [
                            '-p',
                            '--output-format',
                            'json',
                            '--tools',
                            '',
                            '--strict-mcp-config',
                            '--setting-sources',
                            '',
                            '--no-session-persistence',
                            `--system-prompt=${system}`,
                        ],
                        { cwd, env: buildCliEnv(process.env), input: prompt },
                    ));
                } catch (error) {
                    if (error instanceof ProviderTransientError && hasErrorEnvelope(error.stdout)) {
                        return readEnvelope(error.stdout);
                    }
                    throw error;
                } finally {
                    rmSync(cwd, { force: true, recursive: true });
                }
                return readEnvelope(stdout);
            });
        },
    };
}
