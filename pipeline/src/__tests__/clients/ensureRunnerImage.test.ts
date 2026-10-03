// A failed image build reaches the caller, is not logged a second time, and is not cached: the next
// call tries the build again. Docker is faked so no real image is built.
import { afterEach, describe, expect, it, vi } from 'vitest';

const dockerCalls: string[][] = [];

vi.mock('node:child_process', () => ({
    execFile: (
        _command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
        dockerCalls.push(args);
        callback(new Error('docker unavailable'), '', 'docker unavailable');
    },
}));

const { ensureRunnerImage } = await import('../../clients/ensureRunnerImage.js');

describe('ensureRunnerImage failure', () => {
    afterEach(() => {
        dockerCalls.length = 0;
        vi.restoreAllMocks();
    });

    it('rejects the caller without a duplicate log and retries on the next call', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(ensureRunnerImage('python')).rejects.toThrow('docker build failed');
        await expect(ensureRunnerImage('python')).rejects.toThrow('docker build failed');

        expect(dockerCalls.filter(([verb]) => verb === 'build')).toHaveLength(2);
        const failureLogs = warn.mock.calls.filter(([message]) => /build for python failed/.test(String(message)));
        expect(failureLogs).toHaveLength(0);
    });
});
