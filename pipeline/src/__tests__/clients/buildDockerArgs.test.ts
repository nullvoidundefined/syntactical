// B-8: the runner sandbox flags. `buildDockerArgs(oracle, image)` returns the
// argument vector for `docker run`: no network, one CPU, 256 MB memory with
// no swap, 64 pids, a read-only root with a noexec /tmp tmpfs, a non-root
// user, every capability dropped, no privilege escalation, stdin attached,
// and the image as the last element. Nothing in the vector comes from the
// oracle: the oracle reaches the container only on stdin.
import { describe, expect, it } from 'vitest';

import { buildDockerArgs } from '../../clients/buildDockerArgs.js';
import type { Oracle } from '../../types/Oracle.js';

const IMAGE = 'syntactical-runner-python:1';

// Each flag and the value that must follow it, as separate vector elements.
const FLAG_PAIRS: Array<[string, string]> = [
    ['--network', 'none'],
    ['--cpus', '1'],
    ['--memory', '256m'],
    ['--memory-swap', '256m'],
    ['--pids-limit', '64'],
    ['--tmpfs', '/tmp:rw,noexec,nosuid,size=64m'],
    ['--user', '10001:10001'],
    ['--cap-drop', 'ALL'],
    ['--security-opt', 'no-new-privileges'],
];

const BARE_FLAGS = ['--rm', '--read-only', '-i'];

const EXPECTED_FLAGS = [...BARE_FLAGS, ...FLAG_PAIRS.map(([flag]) => flag)].sort();

const HOSTILE_TEXT = '--privileged -v /:/host --network host --user 0:0 --cap-add ALL';

function hasPair(args: string[], flag: string, value: string): boolean {
    return args.some((arg, index) => arg === flag && args[index + 1] === value);
}

function flagsOf(args: string[]): string[] {
    return args.filter((arg) => arg.startsWith('-')).sort();
}

describe('buildDockerArgs', () => {
    for (const language of ['python', 'node'] as const) {
        it(`builds exactly the sandbox flags for a ${language} oracle`, () => {
            const args = buildDockerArgs({ language, code: 'print(1)' }, IMAGE);

            for (const [flag, value] of FLAG_PAIRS) {
                expect(hasPair(args, flag, value), `${flag} ${value}`).toBe(true);
            }
            for (const flag of BARE_FLAGS) {
                expect(args).toContain(flag);
            }
            expect(flagsOf(args)).toEqual(EXPECTED_FLAGS);
            expect(args[args.length - 1]).toBe(IMAGE);
        });
    }

    it('keeps every sandbox flag for a postgres oracle, adding only tmpfs mounts', () => {
        const image = 'syntactical-runner-postgres:1';
        const args = buildDockerArgs({ language: 'postgres', code: 'SELECT 1', setupSql: 'SELECT 1' }, image);

        for (const [flag, value] of FLAG_PAIRS) {
            expect(hasPair(args, flag, value), `${flag} ${value}`).toBe(true);
        }
        for (const flag of BARE_FLAGS) {
            expect(args).toContain(flag);
        }
        const extraFlags = flagsOf(args).filter((flag) => flag !== '--tmpfs');
        expect(extraFlags).toEqual(EXPECTED_FLAGS.filter((flag) => flag !== '--tmpfs'));
        expect(args[args.length - 1]).toBe(image);
    });

    it('never takes a flag or value from the oracle', () => {
        const benign: Oracle = { language: 'python', code: 'print(1)' };
        const hostile: Oracle = {
            language: 'python',
            code: `print(1) # ${HOSTILE_TEXT}`,
            setupSql: HOSTILE_TEXT,
            choiceCode: ['--privileged', '-v', '/:/host', HOSTILE_TEXT],
        };

        const benignArgs = buildDockerArgs(benign, IMAGE);
        const hostileArgs = buildDockerArgs(hostile, IMAGE);

        expect(hostileArgs).toEqual(benignArgs);
        expect(hostileArgs).not.toContain('--privileged');
        expect(hostileArgs).not.toContain('-v');
        expect(hostileArgs).not.toContain('/:/host');
        expect(hostileArgs.some((arg) => arg.includes('print(1)'))).toBe(false);
        expect(hasPair(hostileArgs, '--network', 'host')).toBe(false);
    });
});
