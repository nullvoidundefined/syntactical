import { describe, expect, it } from 'vitest';

import { readCheckerPythonVersion } from '../../services/readCheckerPythonVersion.js';

describe('readCheckerPythonVersion', () => {
    it('asks the real checker script for the interpreter version', async () => {
        expect(await readCheckerPythonVersion()).toMatch(/^3\.\d+\.\d+/);
    });

    it('passes the version flag and no program on stdin', async () => {
        const calls: { args: string[]; input: string }[] = [];
        const version = await readCheckerPythonVersion(async (_file, args, options) => {
            calls.push({ args, input: options.input });
            return { stdout: '3.13.1\n' };
        });
        expect(version).toBe('3.13.1');
        expect(calls[0]?.args.at(-1)).toBe('--version');
        expect(calls[0]?.input).toBe('');
    });

    it('reports unavailable, with the cause, when python3 cannot run', async () => {
        const version = await readCheckerPythonVersion(async () => {
            throw new Error('python3 could not start');
        });
        expect(version).toBe('unavailable (python3 could not start)');
    });
});
