// B-8b baseline: forgery and hard-kill cases the runner already handles. They
// guard against a regression while the B-8b fix lands; the failing cases are
// in dockerRunnerForgery.test.ts.
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

describe.skipIf(SKIP_DOCKER)('runOracle forgery and hard kill baseline (B-8b)', () => {
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
        it('ignores a Python line forged on fd 1 and reports what the code printed', async () => {
            const run = await runOracle({
                language: 'python',
                code: `import os\nos.write(1, b'${FORGED_LINE}\\n')\nprint(7)`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
            expect(run.outcome === 'value' ? run.value : '7', JSON.stringify(run)).toContain('7');
        }, RUN_TIMEOUT_MS);

        it('ignores a Python line forged on sys.__stdout__ and reports what the code printed', async () => {
            const run = await runOracle({
                language: 'python',
                code: `import sys\nsys.__stdout__.write('${FORGED_LINE}\\n')\nsys.__stdout__.flush()\nprint(7)`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
            expect(run.outcome === 'value' ? run.value : '7', JSON.stringify(run)).toContain('7');
        }, RUN_TIMEOUT_MS);

        it('ignores a Node line forged on fd 1 and reports what the code logged', async () => {
            const run = await runOracle({
                language: 'node',
                code: `(await import('node:fs')).writeSync(1, '${FORGED_LINE}\\n')\nconsole.log(7)`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
            expect(run.outcome === 'value' ? run.value : '7', JSON.stringify(run)).toContain('7');
        }, RUN_TIMEOUT_MS);

        it('ignores a Node line forged on fd 1 before process.abort', async () => {
            const run = await runOracle({
                language: 'node',
                code: `(await import('node:fs')).writeSync(1, '${FORGED_LINE}\\n')\nprocess.abort()`,
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
        }, RUN_TIMEOUT_MS);
    });

    describe('hard kill at the timeout', () => {
        it('kills Python that ignores SIGTERM, leaving no container', async () => {
            const startedAt = Date.now();
            const run = await runOracle(
                {
                    language: 'python',
                    code: 'import signal\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\nwhile True: pass',
                },
                { timeoutMs: 2000 },
            );
            const elapsedMs = Date.now() - startedAt;

            expect(run.outcome).toBe('timeout');
            expect(elapsedMs).toBeLessThan(6000);
            expect(runningRunnerContainers('python')).toBe('');
        }, RUN_TIMEOUT_MS);

        it('kills a Node busy loop, leaving no container', async () => {
            const startedAt = Date.now();
            const run = await runOracle({ language: 'node', code: 'while (true) {}' }, { timeoutMs: 2000 });
            const elapsedMs = Date.now() - startedAt;

            expect(run.outcome).toBe('timeout');
            expect(elapsedMs).toBeLessThan(6000);
            expect(runningRunnerContainers('node')).toBe('');
        }, RUN_TIMEOUT_MS);
    });
});
