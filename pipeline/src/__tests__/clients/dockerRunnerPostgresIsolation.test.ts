// B-8c: a Postgres oracle runs as a non-superuser role, so it cannot write the
// harness's files, read them, run programs, or forge the run's verdict.
//
// Spec invariant: correctness of a published executable question is decided by
// its oracle's output, never by anything else. A Postgres oracle's output is
// the first column of the first row its code returns; a value the oracle
// writes into a file with server-side COPY is not its output and must never
// become the run's value. Security (runner sandbox): the oracle gets no
// privilege beyond running SQL against its own throwaway database.
//
// The case that already passes today (setupSql creates and fills a table the
// code then reads) lives in dockerRunner.test.ts ("runs the Postgres setupSql
// before the code") and must keep passing once the oracle loses superuser.
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

// SQLSTATE insufficient_privilege.
const INSUFFICIENT_PRIVILEGE = '42501';

describe.skipIf(SKIP_DOCKER)('runOracle Postgres privilege isolation (B-8c)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('postgres');
    }, DOCKER_LOCK_WAIT_MS + 300_000);

    afterEach(() => {
        killLeftoverRunnerContainers();
    });

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe('a verdict written with server-side COPY is never the result', () => {
        it('ignores a forged result.json written before the oracle times out', async () => {
            const run = await runOracle(
                {
                    language: 'postgres',
                    code: [
                        `COPY (SELECT '{"outcome":"value","value":"42","runtimeVersion":"PostgreSQL 17"}')`,
                        `TO '/tmp/work/result.json';`,
                        'SELECT pg_sleep(30)',
                    ].join(' '),
                },
                { timeoutMs: 3000 },
            );

            expect(run.value, JSON.stringify(run)).not.toBe('42');
            expect(['exception', 'timeout'], JSON.stringify(run)).toContain(run.outcome);
            if (run.outcome === 'exception') {
                expect(run.exceptionType).toBe(INSUFFICIENT_PRIVILEGE);
            }
            expect(runningRunnerContainers('postgres')).toBe('');
        }, RUN_TIMEOUT_MS);

        it('ignores a padded forged line that would survive the harness overwriting result.json', async () => {
            const run = await runOracle({
                language: 'postgres',
                code: [
                    `COPY (SELECT repeat(' ', 300) || chr(10) || '{"outcome":"value","value":"42"}')`,
                    `TO '/tmp/work/result.json';`,
                    'SELECT 1',
                ].join(' '),
            });

            expect(run.value, JSON.stringify(run)).not.toBe('42');
            if (run.outcome === 'value') {
                expect(run.value).toBe('1');
            } else {
                expect(run.outcome, JSON.stringify(run)).toBe('exception');
                expect(run.exceptionType).toBe(INSUFFICIENT_PRIVILEGE);
            }
            expect(runningRunnerContainers('postgres')).toBe('');
        }, RUN_TIMEOUT_MS);
    });

    describe('superuser-only capabilities are denied', () => {
        it('refuses COPY TO PROGRAM with insufficient_privilege', async () => {
            const run = await runOracle({
                language: 'postgres',
                code: "COPY (SELECT 1) TO PROGRAM 'id'",
            });

            expect(run.outcome, JSON.stringify(run)).toBe('exception');
            expect(run.exceptionType).toBe(INSUFFICIENT_PRIVILEGE);
            expect(run.value).toBeUndefined();
            expect(runningRunnerContainers('postgres')).toBe('');
        }, RUN_TIMEOUT_MS);

        it('refuses pg_read_file on the harness with insufficient_privilege', async () => {
            const run = await runOracle({
                language: 'postgres',
                code: "SELECT pg_read_file('/harness/harness.sh')",
            });

            expect(run.outcome, JSON.stringify(run)).toBe('exception');
            expect(run.exceptionType).toBe(INSUFFICIENT_PRIVILEGE);
            expect(run.value).toBeUndefined();
            expect(runningRunnerContainers('postgres')).toBe('');
        }, RUN_TIMEOUT_MS);

        it('runs the oracle session as a role that is not a superuser', async () => {
            const run = await runOracle({
                language: 'postgres',
                code: "SELECT current_setting('is_superuser')",
            });

            expect(run.outcome, JSON.stringify(run)).toBe('value');
            expect(run.value).toBe('off');
            expect(runningRunnerContainers('postgres')).toBe('');
        }, RUN_TIMEOUT_MS);
    });

    describe('the oracle role cannot become the bootstrap superuser', () => {
        it.each([
            ['SET ROLE runner; SELECT 1'],
            ['SET SESSION AUTHORIZATION runner; SELECT 1'],
            ['CREATE EXTENSION dblink; SELECT 1'],
            ["SELECT lo_export(lo_from_bytea(0, 'x'), '/tmp/work/ready')"],
        ])('refuses %s with insufficient_privilege', async (code) => {
            const run = await runOracle({ code, language: 'postgres' });

            expect(run.outcome, JSON.stringify(run)).toBe('exception');
            expect(run.exceptionType).toBe(INSUFFICIENT_PRIVILEGE);
            expect(run.value).toBeUndefined();
            expect(runningRunnerContainers('postgres')).toBe('');
        }, RUN_TIMEOUT_MS);
    });
});
