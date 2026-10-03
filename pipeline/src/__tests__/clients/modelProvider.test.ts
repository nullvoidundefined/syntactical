// B-14: ModelProvider returns schema-checked structured output from either the
// `claude -p` path or the API path. Malformed JSON or a schema failure is a
// failed attempt; three failed attempts in all raise ModelOutputInvalid.
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildCliEnv, type ExecOptions } from '../../clients/claudeCliProvider.js';
import { createModelProvider } from '../../clients/modelProvider.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';

const schema = z.object({ topic: z.string() });
const MAX_ATTEMPTS = 3;
const LONG_OUTPUT_LENGTH = 5000;
const MAX_MESSAGE_LENGTH = 500;
const REQUEST = { prompt: 'p', promptVersion: 'v1', schema, system: 's' };

function cliAnswer(result: string) {
    return { stdout: JSON.stringify({ model: 'claude-x', result }) };
}

function apiAnswer(text: string) {
    return { content: [{ text, type: 'text' }], model: 'claude-y' };
}

describe('ModelProvider', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('parses structured output from the CLI path', async () => {
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"topic":"strings"}'));
        await expect(createModelProvider('cli', { exec }).generate(REQUEST)).resolves.toEqual({
            model: 'claude-x',
            value: { topic: 'strings' },
        });
    });

    it('throws ModelOutputInvalid after three schema failures', async () => {
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"nope":1}'));
        await expect(createModelProvider('cli', { exec }).generate(REQUEST)).rejects.toBeInstanceOf(
            ModelOutputInvalid,
        );
        expect(exec).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });

    it('parses structured output from the API path', async () => {
        const create = vi.fn().mockResolvedValue(apiAnswer('{"topic":"wtf"}'));
        await expect(createModelProvider('api', { messages: { create } }).generate(REQUEST)).resolves.toEqual({
            model: 'claude-y',
            value: { topic: 'wtf' },
        });
    });

    it('counts malformed JSON as a failed attempt and carries the prompt version', async () => {
        const create = vi.fn().mockResolvedValue(apiAnswer('not json at all'));
        const failure = (await createModelProvider('api', { messages: { create } })
            .generate(REQUEST)
            .catch((error: unknown) => error)) as ModelOutputInvalid;
        expect(failure).toBeInstanceOf(ModelOutputInvalid);
        expect(failure.promptVersion).toBe('v1');
        expect(failure.issue).toContain('malformed JSON');
        expect(create).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });

    it('resolves when attempt 2 succeeds, without a third call', async () => {
        const exec = vi
            .fn()
            .mockResolvedValueOnce(cliAnswer('{"nope":1}'))
            .mockResolvedValueOnce(cliAnswer('{"topic":"loops"}'));
        await expect(createModelProvider('cli', { exec }).generate(REQUEST)).resolves.toEqual({
            model: 'claude-x',
            value: { topic: 'loops' },
        });
        expect(exec).toHaveBeenCalledTimes(2);
    });

    it('never puts the raw model output in the error beyond a short excerpt', async () => {
        const longOutput = `{ not json ${'z'.repeat(LONG_OUTPUT_LENGTH)}`;
        const create = vi.fn().mockResolvedValue(apiAnswer(longOutput));
        const failure = (await createModelProvider('api', { messages: { create } })
            .generate(REQUEST)
            .catch((error: unknown) => error)) as ModelOutputInvalid;
        expect(failure).toBeInstanceOf(ModelOutputInvalid);
        expect(failure.message).not.toContain(longOutput);
        expect(failure.message.length).toBeLessThan(MAX_MESSAGE_LENGTH);
    });

    it('sends PIPELINE_MODEL to messages.create, defaulting to claude-opus-5-5', async () => {
        const create = vi.fn().mockResolvedValue(apiAnswer('{"topic":"a"}'));
        vi.stubEnv('PIPELINE_MODEL', '');
        const provider = createModelProvider('api', { messages: { create } });
        await provider.generate(REQUEST);
        expect(create.mock.calls[0]?.[0]).toMatchObject({ model: 'claude-opus-5-5', system: 's' });
        vi.stubEnv('PIPELINE_MODEL', 'claude-test-model');
        await provider.generate(REQUEST);
        expect(create.mock.calls[1]?.[0]).toMatchObject({
            messages: [{ content: 'p', role: 'user' }],
            model: 'claude-test-model',
        });
    });

    it('runs the CLI with no tools, no MCP servers, and the system prompt bound to its flag', async () => {
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"topic":"a"}'));
        const system = 'sys; rm -rf / "quoted" $(whoami)';
        await createModelProvider('cli', { exec }).generate({ ...REQUEST, system });
        expect(exec.mock.calls[0]?.[0]).toBe('claude');
        expect(exec.mock.calls[0]?.[1]).toEqual([
            '-p',
            '--output-format',
            'json',
            '--tools',
            '',
            '--strict-mcp-config',
            '--no-session-persistence',
            `--system-prompt=${system}`,
        ]);
    });

    it('sends the prompt on stdin, never in argv, so it cannot read as a flag or subcommand', async () => {
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"topic":"a"}'));
        for (const prompt of ['--mcp-config /tmp/evil.json', 'agents', 'mcp add evil']) {
            exec.mockClear();
            await createModelProvider('cli', { exec }).generate({ ...REQUEST, prompt });
            const [, args, options] = exec.mock.calls[0] as [string, string[], ExecOptions];
            expect(args).not.toContain(prompt);
            expect(options.input).toBe(prompt);
        }
    });

    it('runs the CLI in an empty scratch directory outside the repo and removes it afterwards', async () => {
        let seenCwd = '';
        let entriesAtCall: string[] = [];
        const exec = vi.fn(async (_file: string, _args: string[], options: ExecOptions) => {
            seenCwd = options.cwd;
            entriesAtCall = readdirSync(options.cwd);
            return cliAnswer('{"topic":"a"}');
        });
        await createModelProvider('cli', { exec }).generate(REQUEST);
        expect(seenCwd.startsWith(tmpdir())).toBe(true);
        expect(seenCwd.startsWith(process.cwd())).toBe(false);
        expect(entriesAtCall).toEqual([]);
        expect(existsSync(seenCwd)).toBe(false);
    });

    it('passes only PATH, HOME, locale, temp, user, and Claude or Anthropic variables to the CLI', () => {
        const source = {
            ANTHROPIC_BASE_URL: 'https://example.invalid',
            AWS_PROFILE: 'prod',
            CLAUDE_CONFIG_DIR: '/c',
            DATABASE_URL: 'postgres-url-placeholder',
            HOME: '/h',
            PATH: '/bin',
            npm_config_registry: 'r',
        };
        expect(buildCliEnv(source)).toEqual({
            ANTHROPIC_BASE_URL: 'https://example.invalid',
            CLAUDE_CONFIG_DIR: '/c',
            HOME: '/h',
            PATH: '/bin',
        });
    });

    it('hands the CLI the filtered environment, not the full process environment', async () => {
        vi.stubEnv('DATABASE_URL', 'postgres-url-placeholder');
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"topic":"a"}'));
        await createModelProvider('cli', { exec }).generate(REQUEST);
        const [, , options] = exec.mock.calls[0] as [string, string[], ExecOptions];
        expect(options.env.DATABASE_URL).toBeUndefined();
        expect(options.env.PATH).toBe(process.env.PATH);
    });

    it('reads the model name from modelUsage when the envelope has no top-level model', async () => {
        const exec = vi.fn().mockResolvedValue({
            stdout: JSON.stringify({ modelUsage: { 'claude-opus-5-5': {} }, result: '{"topic":"a"}' }),
        });
        await expect(createModelProvider('cli', { exec }).generate(REQUEST)).resolves.toEqual({
            model: 'claude-opus-5-5',
            value: { topic: 'a' },
        });
    });

    it('fails fast on a CLI error envelope instead of retrying it as model text', async () => {
        const exec = vi.fn().mockResolvedValue({
            stdout: JSON.stringify({ is_error: true, result: 'Credit balance too low', subtype: 'error' }),
        });
        await expect(createModelProvider('cli', { exec }).generate(REQUEST)).rejects.toThrow(
            /claude CLI reported an error/,
        );
        expect(exec).toHaveBeenCalledTimes(1);
    });

    it('reports a model name of unknown when the CLI envelope omits it', async () => {
        const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ result: '{"topic":"a"}' }) });
        await expect(createModelProvider('cli', { exec }).generate(REQUEST)).resolves.toEqual({
            model: 'unknown',
            value: { topic: 'a' },
        });
    });

    it('fails fast when the API stops at max_tokens instead of retrying the same request', async () => {
        const create = vi.fn().mockResolvedValue({ ...apiAnswer('{"topic":'), stop_reason: 'max_tokens' });
        await expect(createModelProvider('api', { messages: { create } }).generate(REQUEST)).rejects.toThrow(
            /max_tokens/,
        );
        expect(create).toHaveBeenCalledTimes(1);
    });
});

describe('ModelOutputInvalid', () => {
    it('truncates a long issue to a short excerpt', () => {
        const longIssue = 'y'.repeat(LONG_OUTPUT_LENGTH);
        const failure = new ModelOutputInvalid('v1', longIssue);
        expect(failure.message).not.toContain(longIssue);
        expect(failure.issue.length).toBeLessThan(MAX_MESSAGE_LENGTH);
        expect(failure.message.length).toBeLessThan(MAX_MESSAGE_LENGTH);
    });
});
