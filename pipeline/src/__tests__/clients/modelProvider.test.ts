// B-14: ModelProvider returns schema-checked structured output from either the
// `claude -p` path or the API path. Malformed JSON or a schema failure is a
// failed attempt; three failed attempts in all raise ModelOutputInvalid.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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

    it('passes the CLI system and prompt as separate argv elements, never a shell string', async () => {
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"topic":"a"}'));
        const system = 'sys; rm -rf / "quoted" $(whoami)';
        const prompt = 'line one\nline two `tick`';
        await createModelProvider('cli', { exec }).generate({ ...REQUEST, prompt, system });
        expect(exec).toHaveBeenCalledWith('claude', [
            '-p',
            '--output-format',
            'json',
            `--system-prompt=${system}`,
            '--',
            prompt,
        ]);
    });

    it('keeps a prompt or system prompt that starts with a dash from reading as a CLI flag', async () => {
        const exec = vi.fn().mockResolvedValue(cliAnswer('{"topic":"a"}'));
        const prompt = '--mcp-config /tmp/evil.json';
        const system = '--allowedTools Bash';
        await createModelProvider('cli', { exec }).generate({ ...REQUEST, prompt, system });
        const args = exec.mock.calls[0]?.[1] as string[];
        const terminator = args.indexOf('--');
        expect(terminator).toBeGreaterThan(-1);
        expect(args.slice(terminator + 1)).toEqual([prompt]);
        expect(args.slice(0, terminator)).not.toContain(prompt);
        expect(args.slice(0, terminator)).not.toContain(system);
        expect(args).toContain(`--system-prompt=${system}`);
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
