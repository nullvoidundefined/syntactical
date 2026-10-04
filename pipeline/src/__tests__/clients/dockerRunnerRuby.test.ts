// Ruby and Rails tracks: `runOracle` executes an oracle in the `ruby` or `rails` runner image
// (real Docker containers) under the same contract and sandbox as the other runners. A printed
// value is reported as text with the runtime version; a raised error is reported with its full
// exception class name; a parse failure is `syntax-error`. The `rails` image loads ActiveSupport
// and ActiveRecord connected to an in-memory SQLite database, with migration and query logging
// silenced so only the oracle's own output is the value.
//
// Set SKIP_DOCKER_TESTS=1 to skip this file where Docker is unavailable; it runs by default.
import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import { runnerImageTag } from '../../clients/runnerImageTag.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';
import { acquireDockerTestLock, DOCKER_LOCK_WAIT_MS, releaseDockerTestLock } from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';

const RUN_TIMEOUT_MS = 60_000;

const RUBY_LANGUAGES: OracleLanguage[] = ['ruby', 'rails'];

const RUBY_VERSION = /^Ruby 3\.\d+\.\d+$/;
const RAILS_VERSION = /^Rails \d+\.\d+\.\d+ \(Ruby 3\.\d+\.\d+\)$/;

const USERS_SCHEMA = [
    'ActiveRecord::Schema.define { create_table(:users) { |t| t.string :name } }',
    'class User < ActiveRecord::Base',
    '  validates :name, presence: true',
    'end',
].join('\n');

function runningContainers(language: OracleLanguage): string {
    return execFileSync('docker', ['ps', '-q', '--filter', `ancestor=${runnerImageTag(language)}`], {
        encoding: 'utf8',
    }).trim();
}

describe.skipIf(SKIP_DOCKER)('runOracle ruby and rails (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('ruby');
        await ensureRunnerImage('rails');
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe('runtime versions', () => {
        it(
            'reports a Ruby printed value and the Ruby version',
            async () => {
                const run = await runOracle({ language: 'ruby', code: 'puts 0.1 + 0.2' });

                expect(run.outcome).toBe('value');
                expect(run.value).toBe('0.30000000000000004');
                expect(run.runtimeVersion).toMatch(RUBY_VERSION);
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'reports the Rails and Ruby versions for a rails oracle',
            async () => {
                const run = await runOracle({ language: 'rails', code: 'puts 1' });

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
                expect(run.runtimeVersion).toMatch(RAILS_VERSION);
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe.each(RUBY_LANGUAGES)('%s contract', (language) => {
        it(
            'reports multi-line output without the trailing newline',
            async () => {
                const run = await runOracle({ language, code: 'puts 1\nputs 2' });

                expect(run).toMatchObject({ outcome: 'value', value: '1\n2' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records a raise with its exception class',
            async () => {
                const run = await runOracle({ language, code: "raise ArgumentError, 'x'" });

                expect(run.outcome).toBe('exception');
                expect(run.exceptionType).toBe('ArgumentError');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records a runtime ZeroDivisionError',
            async () => {
                const run = await runOracle({ language, code: 'puts 1 / 0' });

                expect(run).toMatchObject({ exceptionType: 'ZeroDivisionError', outcome: 'exception' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records code that does not parse as a syntax error',
            async () => {
                const run = await runOracle({ language, code: 'def (' });

                expect(run.outcome).toBe('syntax-error');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs an oracle far larger than one argv argument',
            async () => {
                const run = await runOracle({ language, code: `# ${'x'.repeat(200_000)}\nputs 1` });

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'reports the value once the oracle exits, not when a grandchild holding stdout exits',
            async () => {
                const startedAt = Date.now();
                const run = await runOracle(
                    { language, code: "Process.detach(spawn('sleep', '30'))\nputs 1" },
                    { timeoutMs: 6000 },
                );

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
                expect(Date.now() - startedAt).toBeLessThan(language === 'rails' ? 5000 : 3000);
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe.each(RUBY_LANGUAGES)('%s sandbox', (language) => {
        it(
            'gives the oracle no network',
            async () => {
                const run = await runOracle({
                    language,
                    code: "require 'socket'\nTCPSocket.new('1.1.1.1', 53)\nputs 'connected'",
                });

                expect(run.outcome).not.toBe('value');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'kills a run past the wall-clock limit and leaves no container running',
            async () => {
                const startedAt = Date.now();
                const run = await runOracle({ language, code: 'loop {}' }, { timeoutMs: 3000 });

                expect(run.outcome).toBe('timeout');
                expect(Date.now() - startedAt).toBeLessThan(8000);
                expect(runningContainers(language)).toBe('');
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'stops an allocation past 256 MB',
            async () => {
                const run = await runOracle({ language, code: "s = 'x' * (512 * 1024 * 1024)\nputs s.size" });

                expect(run).toMatchObject({ outcome: 'resource-limit' });
                expect(run.exceptionType).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'stops a fork bomb and leaves no container running',
            async () => {
                const run = await runOracle({ language, code: "loop { fork }\nputs 'escaped'" });

                expect(run.outcome).not.toBe('value');
                expect(run.value).toBeUndefined();
                expect(runningContainers(language)).toBe('');
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'refuses a write outside /tmp',
            async () => {
                const run = await runOracle({ language, code: "File.write('/etc/x', 'x')\nputs 'written'" });

                expect(run.outcome).toBe('exception');
                expect(['Errno::EROFS', 'Errno::EACCES']).toContain(run.exceptionType);
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs the oracle as uid 10001, not root',
            async () => {
                const run = await runOracle({ language, code: 'puts Process.uid' });

                expect(run).toMatchObject({ outcome: 'value', value: '10001' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records output past 64 KB as a resource limit',
            async () => {
                const run = await runOracle({ language, code: "puts 'x' * 200_000" });

                expect(run.outcome).toBe('resource-limit');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe('rails libraries', () => {
        it(
            'loads ActiveSupport core extensions',
            async () => {
                const run = await runOracle({
                    language: 'rails',
                    code: "puts 'person'.pluralize\nputs 1.day.to_i\nputs [].blank?",
                });

                expect(run).toMatchObject({ outcome: 'value', value: 'people\n86400\ntrue' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'queries an in-memory SQLite database through ActiveRecord with no schema or SQL log output',
            async () => {
                const run = await runOracle({
                    language: 'rails',
                    code: `${USERS_SCHEMA}\nUser.create!(name: 'a')\nUser.create!(name: 'b')\nputs User.where(name: 'a').count`,
                });

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'reports a namespaced ActiveRecord error with its full class name',
            async () => {
                const run = await runOracle({ language: 'rails', code: `${USERS_SCHEMA}\nUser.create!(name: '')` });

                expect(run).toMatchObject({ exceptionType: 'ActiveRecord::RecordInvalid', outcome: 'exception' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'does not offer ActiveRecord in the plain ruby image',
            async () => {
                const run = await runOracle({ language: 'ruby', code: 'puts defined?(ActiveRecord).inspect' });

                expect(run).toMatchObject({ outcome: 'value', value: 'nil' });
            },
            RUN_TIMEOUT_MS,
        );
    });
});
