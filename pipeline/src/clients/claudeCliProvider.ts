// ModelProvider over `claude -p`. The model only completes text, so the CLI runs
// with every built-in tool and MCP server turned off, in an empty scratch
// directory, with a minimal environment: a prompt drawn from content cannot make
// it read, run, or fetch anything. The prompt travels on stdin, so no prompt text
// can be parsed as a CLI option or subcommand; the system prompt is bound to its
// flag with `=`.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ModelProvider } from '../types/ModelProvider.js';
import { generateWithRetries } from './generateWithRetries.js';

const UNKNOWN_MODEL = 'unknown';
const KIBIBYTE = 1024;
const MAX_STDOUT_MEBIBYTES = 32;
const MAX_STDOUT_BYTES = MAX_STDOUT_MEBIBYTES * KIBIBYTE * KIBIBYTE;
const CLI_TIMEOUT_MS = 300_000;
const PASSED_ENV_NAMES = ['HOME', 'LANG', 'PATH', 'TMPDIR', 'USER'];
const PASSED_ENV_PREFIXES = ['ANTHROPIC_', 'CLAUDE_'];

export interface ExecOptions {
    cwd: string;
    env: NodeJS.ProcessEnv;
    input: string;
}

export type ExecFn = (file: string, args: string[], options: ExecOptions) => Promise<{ stdout: string }>;

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

function defaultExec(file: string, args: string[], options: ExecOptions): Promise<{ stdout: string }> {
    const { cwd, env, input } = options;
    return new Promise((resolve, reject) => {
        const child = spawn(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });
        const chunks: Buffer[] = [];
        let received = 0;
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`claude CLI timed out after ${CLI_TIMEOUT_MS} ms`));
        }, CLI_TIMEOUT_MS);
        child.stdout.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_STDOUT_BYTES) {
                child.kill('SIGKILL');
                return;
            }
            chunks.push(chunk);
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            // The spawn error never carries argv or the prompt; report the cause only.
            reject(new Error(`claude CLI could not start: ${error.message}`));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(`claude CLI exited with status ${String(code)}`));
                return;
            }
            resolve({ stdout: Buffer.concat(chunks).toString('utf8') });
        });
        child.stdin.on('error', () => undefined);
        child.stdin.end(input);
    });
}

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
                        '--no-session-persistence',
                        `--system-prompt=${system}`,
                    ],
                    { cwd, env: buildCliEnv(process.env), input: prompt },
                ));
                } finally {
                    rmSync(cwd, { force: true, recursive: true });
                }
                return readEnvelope(stdout);
            });
        },
    };
}
