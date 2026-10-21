// The node runner compiles an oracle as the body of an async function, so static `import` is a
// syntax error and Node.js-track oracles need `require`. The runner provides one (like the
// typescript runner since #157): built-in modules load, and a module written to /tmp is cached.
import { afterAll, beforeAll, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import { describeDocker } from '../fixtures/dockerSuite.js';
import { acquireDockerTestLock, DOCKER_LOCK_WAIT_MS, releaseDockerTestLock } from '../fixtures/dockerTestLock.js';

const RUN_TIMEOUT_MS = 60_000;

describeDocker('runOracle node require (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('node');
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    it(
        'loads a built-in module with require',
        async () => {
            const run = await runOracle({
                language: 'node',
                code: "const { EventEmitter } = require('node:events');\nconst e = new EventEmitter();\nconsole.log(e.emit('x'));",
            });

            expect(run).toMatchObject({ outcome: 'value', value: 'false' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'requires a module written to /tmp and returns the cached exports on the second require',
        async () => {
            const run = await runOracle({
                language: 'node',
                code: [
                    "const fs = require('node:fs');",
                    "fs.writeFileSync('/tmp/counter.js', 'module.exports = { n: 0 };');",
                    "const a = require('/tmp/counter.js');",
                    'a.n += 1;',
                    "console.log(require('/tmp/counter.js').n);",
                ].join('\n'),
            });

            expect(run).toMatchObject({ outcome: 'value', value: '1' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'still runs plain JavaScript oracles unchanged',
        async () => {
            const run = await runOracle({
                language: 'node',
                code: 'console.log([1, 2, 3].map((x) => x * 2).join(","));',
            });

            expect(run).toMatchObject({ outcome: 'value', value: '2,4,6' });
        },
        RUN_TIMEOUT_MS,
    );
});
