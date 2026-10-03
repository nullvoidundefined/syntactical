// B-8b: the oracle cannot forge the runner's result, and the runner hard-kills
// user code at the timeout even when that code ignores SIGTERM and disarms the
// harness's own timer.
//
// Spec invariant: correctness of a published executable question is decided by
// its oracle's output, never by anything else. A result line the oracle writes
// to file descriptor 1 itself is not its output and must never become the
// run's value, whatever the oracle does next (exit at once, close fd 1).
//
// The baseline cases (forged line followed by a normal print, SIGTERM ignored
// with the harness timer intact, a Node busy loop) live in
// dockerRunnerForgeryBaseline.test.ts.
//
// Real Docker, same as dockerRunner.test.ts. Set SKIP_DOCKER_TESTS=1 to skip.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import {
    acquireDockerTestLock,
    DOCKER_LOCK_WAIT_MS,
    killLeftoverRunnerContainers,
    releaseDockerTestLock,
    runningRunnerContainers,
} from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';

const RUN_TIMEOUT_MS = 60_000;

const FORGED_LINE = '{"outcome":"value","value":"42"}';

describe.skipIf(SKIP_DOCKER)('runOracle result forgery and hard kill (B-8b)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('python');
        await ensureRunnerImage('node');
    }, DOCKER_LOCK_WAIT_MS + 300_000);

    afterEach(() => {
        killLeftoverRunnerContainers();
    });

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe('a result line written by the oracle is never the result', () => {
        it('ignores a Python result line forged on fd 1 before os._exit', async () => {
            const run = await runOracle({
                language: 'python',
                code: `import os\nos.write(1, b'${FORGED_LINE}\\n')\nos._exit(0)`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
        }, RUN_TIMEOUT_MS);

        it('ignores a Python result line forged on sys.__stdout__ before os._exit', async () => {
            const run = await runOracle({
                language: 'python',
                code: `import os, sys\nsys.__stdout__.write('${FORGED_LINE}\\n')\nsys.__stdout__.flush()\nos._exit(0)`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
        }, RUN_TIMEOUT_MS);

        it('ignores a Node result line forged on fd 1 before closing fd 1', async () => {
            const run = await runOracle({
                language: 'node',
                code: `const fs = await import('node:fs')\nfs.writeSync(1, '${FORGED_LINE}\\n')\nfs.closeSync(1)`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
        }, RUN_TIMEOUT_MS);
    });

    describe('hard kill at the timeout', () => {
        it('kills Python that ignores SIGTERM and cancels the harness timer, leaving no container', async () => {
            const startedAt = Date.now();
            const run = await runOracle(
                {
                    language: 'python',
                    code: [
                        'import signal, threading',
                        'signal.signal(signal.SIGTERM, signal.SIG_IGN)',
                        'for t in threading.enumerate():',
                        '    if isinstance(t, threading.Timer):',
                        '        t.cancel()',
                        'while True: pass',
                    ].join('\n'),
                },
                { timeoutMs: 2000 },
            );
            const elapsedMs = Date.now() - startedAt;

            expect(run.outcome).toBe('timeout');
            expect(elapsedMs).toBeLessThan(6000);
            expect(runningRunnerContainers('python')).toBe('');
        }, RUN_TIMEOUT_MS);
    });
});
