// describeDocker registers a Docker suite as skipped, printing one reason, only when
// SKIP_DOCKER_TESTS=1; without it the suite runs. Both suites are registered at collection
// time under each value, and the last test reads back what was registered.
import { describe, expect, it, vi } from 'vitest';

import { describeDocker, DOCKER_SKIP_REASON } from './dockerSuite.js';

function withSkipVariable<T>(value: string | undefined, fn: () => T): T {
    const previous = process.env.SKIP_DOCKER_TESTS;
    if (value === undefined) delete process.env.SKIP_DOCKER_TESTS;
    else process.env.SKIP_DOCKER_TESTS = value;
    try {
        return fn();
    } finally {
        if (previous === undefined) delete process.env.SKIP_DOCKER_TESTS;
        else process.env.SKIP_DOCKER_TESTS = previous;
    }
}

describe('describeDocker', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    let ran = false;

    withSkipVariable('1', () =>
        describeDocker('guarded suite (skipped)', () => {
            it('never runs', () => {
                throw new Error('a skipped Docker suite ran');
            });
        }),
    );
    const printedWhenSkipped = info.mock.calls.map(([line]) => String(line));

    withSkipVariable(undefined, () =>
        describeDocker('guarded suite (runs)', () => {
            it('runs', () => {
                ran = true;
            });
        }),
    );
    const printedWhenRunnable = info.mock.calls.length - printedWhenSkipped.length;
    info.mockRestore();

    it('skips the suite with one reason under SKIP_DOCKER_TESTS=1 and runs it otherwise', ({ task }) => {
        const modes = Object.fromEntries((task.suite?.tasks ?? []).map((sibling) => [sibling.name, sibling.mode]));
        expect(modes['guarded suite (skipped)']).toBe('skip');
        expect(modes['guarded suite (runs)']).toBe('run');
        expect(ran).toBe(true);
        expect(printedWhenSkipped).toEqual([`Docker suite "guarded suite (skipped)" skipped: ${DOCKER_SKIP_REASON}`]);
        expect(printedWhenRunnable).toBe(0);
        expect(DOCKER_SKIP_REASON).toContain('SKIP_DOCKER_TESTS=1');
        expect(DOCKER_SKIP_REASON).toContain('oracle-runners');
    });
});
