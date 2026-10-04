// createSpawnExec bounds a real child process: the input arrives on stdin, a
// child that outlives the timeout is killed, a child that floods stdout past the
// cap is killed, and no failure message carries argv, the input, or stderr.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createSpawnExec } from '../../clients/createSpawnExec.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';

const SHORT_TIMEOUT_MS = 300;
const SMALL_CAP_BYTES = 1024;
const LIMITS = { maxStdoutBytes: SMALL_CAP_BYTES, timeoutMs: SHORT_TIMEOUT_MS };
const TEST_TIMEOUT_MS = 10_000;
const MARKER = 'secret-prompt-marker';

function run(script: string, input = '') {
    const exec = createSpawnExec(LIMITS);
    return exec(process.execPath, ['-e', script], { cwd: tmpdir(), env: { PATH: process.env.PATH }, input });
}

describe('createSpawnExec', () => {
    it(
        'classifies a child timeout as a model-timeout ProviderTransientError',
        async () => {
            const execution = run('setInterval(() => {}, 1000)');
            await expect(execution).rejects.toBeInstanceOf(ProviderTransientError);
            await expect(execution).rejects.toMatchObject({
                message: expect.stringMatching(/timed out after/),
                reason: 'model-timeout',
            });
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'classifies a non-zero child exit as a model-error ProviderTransientError',
        async () => {
            const execution = run('process.exit(3)');
            await expect(execution).rejects.toBeInstanceOf(ProviderTransientError);
            await expect(execution).rejects.toMatchObject({
                message: expect.stringMatching(/exited with status 3/),
                reason: 'model-error',
            });
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'keeps a nonexistent binary startup error fatal',
        async () => {
            const exec = createSpawnExec(LIMITS);
            const execution = exec(join(tmpdir(), `missing-gap-fill-binary-${randomUUID()}`), [], {
                cwd: tmpdir(),
                env: { PATH: process.env.PATH },
                input: '',
            });
            await expect(execution).rejects.toBeInstanceOf(Error);
            await expect(execution).rejects.not.toBeInstanceOf(ProviderTransientError);
            await expect(execution).rejects.toThrow(/could not start/);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'delivers the input on stdin and resolves the stdout',
        async () => {
            const echo = "process.stdin.on('data', (d) => process.stdout.write(d))";
            await expect(run(echo, 'hello on stdin')).resolves.toEqual({ stdout: 'hello on stdin' });
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'kills a child that outlives the timeout and names the timeout',
        async () => {
            const started = Date.now();
            await expect(run('setInterval(() => {}, 1000)')).rejects.toThrow(/timed out after 300 ms/);
            expect(Date.now() - started).toBeLessThan(TEST_TIMEOUT_MS / 2);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'kills a child that floods stdout past the cap and names the cap',
        async () => {
            const flood = "const s = 'x'.repeat(4096); setInterval(() => process.stdout.write(s), 1)";
            await expect(run(flood)).rejects.toThrow(/output exceeded 1024 bytes/);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'reports a non-zero exit without argv, input, or stderr',
        async () => {
            const script = `process.stderr.write('${MARKER}'); process.exit(3)`;
            const failure = (await run(script, MARKER).catch((error: unknown) => error)) as Error;
            expect(failure.message).toMatch(/exited with status 3/);
            expect(failure.message).not.toContain(MARKER);
            expect(failure.message).not.toContain('-e');
        },
        TEST_TIMEOUT_MS,
    );
});
