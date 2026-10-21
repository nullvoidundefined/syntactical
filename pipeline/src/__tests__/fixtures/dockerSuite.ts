// Guard for the suites that run real Docker containers. They run by default;
// `SKIP_DOCKER_TESTS=1` (set locally by `npm run test:unit` and by CI's
// `workspaces` job) skips them and says why, and CI's `oracle-runners` job
// runs them.
import { describe } from 'vitest';

export const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';

export const DOCKER_SKIP_REASON = 'SKIP_DOCKER_TESTS=1 (the oracle-runners CI job runs it)';

export function describeDocker(name: string, fn: () => void): void {
    if (SKIP_DOCKER) {
        console.info(`Docker suite "${name}" skipped: ${DOCKER_SKIP_REASON}`);
        describe.skip(name, fn);
        return;
    }
    describe(name, fn);
}
