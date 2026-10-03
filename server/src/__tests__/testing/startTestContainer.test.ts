// B-3.2r1: the throwaway test container carries a label naming the process
// that started it, and a new run removes only labeled containers whose
// starting process is gone (orphans of a killed run), never any other.
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { startTestContainer } from '../../testing/startTestContainer.js';

const LABEL = 'syntactical-test-db';

function deadPid(): number {
    const { pid } = spawnSync('true');
    return pid;
}

function fakeDocker(listing: string): { calls: string[][]; docker: (args: string[]) => string } {
    const calls: string[][] = [];
    function docker(args: string[]): string {
        calls.push(args);
        const [command] = args;
        if (command === 'ps') return listing;
        if (command === 'run') return 'new-container';
        if (command === 'port') return '127.0.0.1:55555';
        return '';
    }
    return { calls, docker };
}

describe('startTestContainer', () => {
    it('labels the container with the starting process id', () => {
        const { calls, docker } = fakeDocker('');

        const { containerId, databaseUrl } = startTestContainer(docker, 'generated');

        expect(containerId).toBe('new-container');
        expect(databaseUrl).toContain('127.0.0.1:55555');
        const run = calls.find(([command]) => command === 'run') ?? [];
        expect(run).toContain('--label');
        expect(run).toContain(`${LABEL}=${process.pid}`);
    });

    it('lists only labeled containers and removes the orphans among them before starting', () => {
        const { calls, docker } = fakeDocker(`orphan ${deadPid()}\nlive ${process.pid}`);

        startTestContainer(docker, 'generated');

        const listIndex = calls.findIndex(([command]) => command === 'ps');
        const removeIndex = calls.findIndex(([command]) => command === 'rm');
        const runIndex = calls.findIndex(([command]) => command === 'run');
        expect(listIndex).toBeGreaterThanOrEqual(0);
        expect(calls[listIndex]).toContain(`label=${LABEL}`);
        expect(calls.filter(([command]) => command === 'rm')).toEqual([['rm', '-f', 'orphan']]);
        expect(removeIndex).toBeGreaterThan(listIndex);
        expect(runIndex).toBeGreaterThan(removeIndex);
    });

    it('removes nothing when every labeled container belongs to a live process', () => {
        const { calls, docker } = fakeDocker(`live ${process.pid}`);

        startTestContainer(docker, 'generated');

        expect(calls.filter(([command]) => command === 'rm')).toEqual([]);
    });
});
