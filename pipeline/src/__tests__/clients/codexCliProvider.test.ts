// The Codex blind-answer provider over a fake exec: read-only sandbox, stdin closed, the prompt
// after `--`, a minimal environment, the answer read from the last-message file; a missing or
// logged-out CLI stops the run with a message naming `codex login`.
import { existsSync, writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { assertCodexReady, buildCodexEnv, createCodexCliProvider } from '../../clients/codexCliProvider.js';
import type { ExecFn, ExecOptions } from '../../types/ExecFn.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';

const SCHEMA = z.strictObject({ answerIndex: z.number().int() });
const REQUEST = {
    prompt: 'Which choice is right?',
    promptVersion: 'judge-question-v1',
    schema: SCHEMA,
    system: 'Answer the quiz.',
};

type Call = { args: string[]; file: string; options: ExecOptions };

function fakeExec(answers: string[]): ExecFn & { calls: Call[] } {
    const calls: Call[] = [];
    const exec = (async (file: string, args: string[], options: ExecOptions) => {
        calls.push({ args, file, options });
        const outIndex = args.indexOf('--output-last-message');
        writeFileSync(args[outIndex + 1] as string, answers[Math.min(calls.length - 1, answers.length - 1)] as string);
        return { stdout: '' };
    }) as ExecFn & { calls: Call[] };
    exec.calls = calls;
    return exec;
}

// The two failures the real spawn exec raises: a command that cannot start (plain Error) and a
// non-zero exit (ProviderTransientError, which gap-fill would otherwise count as a dropped draft).
const FAILURES: [string, () => Error][] = [
    ['a command that cannot start', () => new Error('codex could not start: spawn codex ENOENT')],
    ['a non-zero exit', () => new ProviderTransientError('model-error', 'codex exited with status 1')],
];

function failing(make: () => Error): ExecFn {
    return async () => {
        throw make();
    };
}

describe('createCodexCliProvider', () => {
    afterEach(() => {
        delete process.env.UNRELATED_VAR;
        delete process.env.CODEX_TEST_HOME;
    });

    it('runs codex exec read-only with stdin closed and the prompt after --', async () => {
        process.env.UNRELATED_VAR = 'present';
        process.env.CODEX_TEST_HOME = 'kept';
        const exec = fakeExec(['{"answerIndex": 2}']);
        const result = await createCodexCliProvider(exec).generate(REQUEST);
        expect(result).toEqual({ model: 'codex-cli', value: { answerIndex: 2 } });
        const [{ args, file, options }] = exec.calls as [Call];
        expect(file).toBe('codex');
        expect(args.slice(0, 3)).toEqual(['exec', '-s', 'read-only']);
        expect(args).toContain('--skip-git-repo-check');
        expect(args.at(-2)).toBe('--');
        expect(args.at(-1)).toContain('Answer the quiz.');
        expect(args.at(-1)).toContain('Which choice is right?');
        expect(options.input).toBe('');
        expect(options.env.UNRELATED_VAR).toBeUndefined();
        expect(options.env.CODEX_TEST_HOME).toBe('kept');
        expect(existsSync(options.cwd)).toBe(false);
    });

    it('never asks codex for a wider sandbox', async () => {
        const exec = fakeExec(['{"answerIndex": 0}']);
        await createCodexCliProvider(exec).generate(REQUEST);
        const { args } = exec.calls[0] as Call;
        expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
        expect(args).not.toContain('danger-full-access');
        expect(args).not.toContain('workspace-write');
    });

    it('keeps a prompt that looks like a flag after the -- terminator', async () => {
        const exec = fakeExec(['{"answerIndex": 0}']);
        await createCodexCliProvider(exec).generate({
            ...REQUEST,
            prompt: '--dangerously-bypass-approvals-and-sandbox',
        });
        const { args } = exec.calls[0] as Call;
        expect(args.indexOf('--')).toBeLessThan(args.findIndex((arg) => arg.includes('--dangerously-bypass')));
        expect(args.filter((arg) => arg === '--dangerously-bypass-approvals-and-sandbox')).toEqual([]);
    });

    it('raises ModelOutputInvalid after three unparseable answers', async () => {
        await expect(createCodexCliProvider(fakeExec(['not json'])).generate(REQUEST)).rejects.toBeInstanceOf(
            ModelOutputInvalid,
        );
    });

    it.each(FAILURES)('turns %s into a plain error naming codex login', async (_name, make) => {
        const error = await createCodexCliProvider(failing(make))
            .generate(REQUEST)
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ModelOutputInvalid);
        expect(error).not.toBeInstanceOf(ProviderTransientError);
        expect((error as Error).message).toMatch(/codex login/);
    });
});

describe('buildCodexEnv', () => {
    it('passes the basic names and CODEX_ names, and nothing else', () => {
        expect(
            buildCodexEnv({ CODEX_HOME: '/c', HOME: '/h', LANG: 'C', PATH: '/p', SECRET_TOKEN: 'x', USER: 'u' }),
        ).toEqual({ CODEX_HOME: '/c', HOME: '/h', LANG: 'C', PATH: '/p', USER: 'u' });
    });
});

describe('assertCodexReady', () => {
    it('runs codex login status and resolves when it succeeds', async () => {
        const calls: string[][] = [];
        await assertCodexReady(async (_file, args) => {
            calls.push(args);
            return { stdout: 'Logged in' };
        });
        expect(calls).toEqual([['login', 'status']]);
    });

    it.each(FAILURES)('throws a codex login message for %s', async (_name, make) => {
        await expect(assertCodexReady(failing(make))).rejects.toThrow(
            'Codex CLI is not installed or not logged in: run `codex login`',
        );
    });
});
