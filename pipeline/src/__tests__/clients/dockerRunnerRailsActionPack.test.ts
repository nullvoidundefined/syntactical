// The rails runner also ships Action Pack, so controllers-and-params oracles can build
// ActionController::Parameters (strong parameters) after `require 'action_controller'`. There is
// still no server, router app, or network: the oracle only uses the library in-process.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import { acquireDockerTestLock, DOCKER_LOCK_WAIT_MS, releaseDockerTestLock } from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';
const RUN_TIMEOUT_MS = 60_000;

describe.skipIf(SKIP_DOCKER)('runOracle rails Action Pack (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('rails');
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    it(
        'permits strong parameters with ActionController::Parameters',
        async () => {
            const run = await runOracle({
                language: 'rails',
                code: [
                    "require 'action_controller'",
                    'params = ActionController::Parameters.new(user: { name: "a", admin: true })',
                    'puts params.require(:user).permit(:name).to_h.keys.inspect',
                ].join('\n'),
            });

            expect(run).toMatchObject({ outcome: 'value', value: '["name"]' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'raises ActionController::ParameterMissing for a missing required key',
        async () => {
            const run = await runOracle({
                language: 'rails',
                code: "require 'action_controller'\nActionController::Parameters.new(a: 1).require(:user)",
            });

            expect(run).toMatchObject({ exceptionType: 'ActionController::ParameterMissing', outcome: 'exception' });
        },
        RUN_TIMEOUT_MS,
    );
});
