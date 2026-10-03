// B-8 and B-12: `runOracle` executes an oracle in its language's runner image
// (real Docker containers) and returns an OracleRun. A printed or selected
// value is reported as text with the runtime version; a raised error is
// reported with its exception type (B-12); a parse failure is `syntax-error`.
// The sandbox holds: no network, a wall-clock timeout that leaves no container
// behind, a 256 MB memory cap, a pids cap, a read-only filesystem, a non-root
// user, and a 64 KB output cap.
//
// Set SKIP_DOCKER_TESTS=1 to skip this file where Docker is unavailable; it
// runs by default.
import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import {
    acquireDockerTestLock,
    DOCKER_LOCK_WAIT_MS,
    releaseDockerTestLock,
} from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';

const RUN_TIMEOUT_MS = 60_000;

function runningContainers(language: 'python' | 'node' | 'postgres'): string {
    return execFileSync(
        'docker',
        ['ps', '-q', '--filter', `ancestor=syntactical-runner-${language}:1`],
        { encoding: 'utf8' },
    ).trim();
}

describe.skipIf(SKIP_DOCKER)('runOracle (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('python');
        await ensureRunnerImage('node');
        await ensureRunnerImage('postgres');
    }, DOCKER_LOCK_WAIT_MS + 300_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe('values and runtime versions', () => {
        it('reports a Python printed value and the Python version', async () => {
            const run = await runOracle({ language: 'python', code: 'print(0.1 + 0.2)' });

            expect(run.outcome).toBe('value');
            expect(run.value).toBe('0.30000000000000004');
            expect(run.runtimeVersion).toMatch(/^Python 3\.\d+\.\d+$/);
        }, RUN_TIMEOUT_MS);

        it('reports a Node logged value and the Node version', async () => {
            const run = await runOracle({ language: 'node', code: 'console.log([] + {})' });

            expect(run.outcome).toBe('value');
            expect(run.value).toBe('[object Object]');
            expect(run.runtimeVersion).toMatch(/^Node v\d+\.\d+\.\d+$/);
        }, RUN_TIMEOUT_MS);

        it('reports the first column of the first Postgres row and the Postgres version', async () => {
            const run = await runOracle({ language: 'postgres', code: 'SELECT 1 + 1' });

            expect(run.outcome).toBe('value');
            expect(run.value).toBe('2');
            expect(run.runtimeVersion).toMatch(/^PostgreSQL \d+/);
        }, RUN_TIMEOUT_MS);

        it('runs the Postgres setupSql before the code', async () => {
            const run = await runOracle({
                language: 'postgres',
                setupSql: 'CREATE TABLE t (x int); INSERT INTO t VALUES (7);',
                code: 'SELECT x FROM t',
            });

            expect(run.outcome).toBe('value');
            expect(run.value).toBe('7');
        }, RUN_TIMEOUT_MS);
    });

    describe('large oracle source', () => {
        const LARGE_COMMENT_CHARS = 200_000;

        it('runs a Python oracle far larger than one argv argument', async () => {
            const run = await runOracle({
                language: 'python',
                code: `# ${'x'.repeat(LARGE_COMMENT_CHARS)}\nprint(1)`,
            });

            expect(run).toMatchObject({ outcome: 'value', value: '1' });
        }, RUN_TIMEOUT_MS);

        it('runs a Node oracle far larger than one argv argument', async () => {
            const run = await runOracle({
                language: 'node',
                code: `// ${'x'.repeat(LARGE_COMMENT_CHARS)}\nconsole.log(1)`,
            });

            expect(run).toMatchObject({ outcome: 'value', value: '1' });
        }, RUN_TIMEOUT_MS);
    });

    describe('exceptions and syntax errors (B-12)', () => {
        it('records a Python raise with its exception type', async () => {
            const run = await runOracle({ language: 'python', code: "raise TypeError('x')" });

            expect(run.outcome).toBe('exception');
            expect(run.exceptionType).toBe('TypeError');
            expect(run.value).toBeUndefined();
            expect(run.runtimeVersion).toMatch(/^Python 3\.\d+\.\d+$/);
        }, RUN_TIMEOUT_MS);

        it('records a Node runtime TypeError with its exception type', async () => {
            const run = await runOracle({ language: 'node', code: 'null.x' });

            expect(run.outcome).toBe('exception');
            expect(run.exceptionType).toBe('TypeError');
            expect(run.value).toBeUndefined();
        }, RUN_TIMEOUT_MS);

        it('records Python code that does not parse as a syntax error', async () => {
            const run = await runOracle({ language: 'python', code: 'def (' });

            expect(run.outcome).toBe('syntax-error');
            expect(run.value).toBeUndefined();
        }, RUN_TIMEOUT_MS);
    });

    describe('sandbox (B-8)', () => {
        it('gives Python no network', async () => {
            const run = await runOracle({
                language: 'python',
                code: "import socket\nsocket.create_connection(('1.1.1.1', 53), timeout=2)\nprint('connected')",
            });

            expect(run.outcome).not.toBe('value');
            expect(run.value).toBeUndefined();
        }, RUN_TIMEOUT_MS);

        it('gives Node no network', async () => {
            const run = await runOracle({
                language: 'node',
                code: "await fetch('https://example.com')\nconsole.log('connected')",
            });

            expect(run.outcome).not.toBe('value');
            expect(run.value).toBeUndefined();
        }, RUN_TIMEOUT_MS);

        it('kills a run past the wall-clock limit and leaves no container running', async () => {
            const startedAt = Date.now();
            const run = await runOracle(
                { language: 'python', code: 'while True: pass' },
                { timeoutMs: 2000 },
            );
            const elapsedMs = Date.now() - startedAt;

            expect(run.outcome).toBe('timeout');
            expect(elapsedMs).toBeLessThan(6000);
            expect(runningContainers('python')).toBe('');
        }, RUN_TIMEOUT_MS);

        it('stops an allocation past 256 MB', async () => {
            const run = await runOracle({
                language: 'python',
                code: 'data = bytearray(512 * 1024 * 1024)\nprint(len(data))',
            });

            expect(run).toMatchObject({ outcome: 'resource-limit' });
            expect(run.exceptionType).toBeUndefined();
        }, RUN_TIMEOUT_MS);

        it('stops a fork bomb and leaves no container running', async () => {
            const run = await runOracle({
                language: 'python',
                code: "import os\nwhile True: os.fork()\nprint('escaped')",
            });

            expect(run.outcome).not.toBe('value');
            expect(run.value).toBeUndefined();
            expect(runningContainers('python')).toBe('');
        }, RUN_TIMEOUT_MS);

        it('refuses a write outside /tmp', async () => {
            const run = await runOracle({
                language: 'python',
                code: "open('/etc/x', 'w').write('x')\nprint('written')",
            });

            expect(run.outcome).toBe('exception');
            expect(['PermissionError', 'OSError']).toContain(run.exceptionType);
        }, RUN_TIMEOUT_MS);

        it('runs the oracle as uid 10001, not root', async () => {
            const run = await runOracle({ language: 'python', code: 'import os\nprint(os.getuid())' });

            expect(run.outcome).toBe('value');
            expect(run.value).toBe('10001');
        }, RUN_TIMEOUT_MS);

        it('records output past 64 KB as a resource limit', async () => {
            const run = await runOracle({ language: 'python', code: "print('x' * 200000)" });

            expect(run.outcome).toBe('resource-limit');
            expect(run.value).toBeUndefined();
        }, RUN_TIMEOUT_MS);
    });
});
