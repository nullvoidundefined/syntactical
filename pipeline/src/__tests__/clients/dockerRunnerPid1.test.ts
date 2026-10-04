// An oracle opens /proc/1/fd/1, writes a forged JSON result line, then signals PID 1
// so the forged line is the last stdout line and can be mistaken for the harness result.
// These probes require PID 1 to deny that write and survive the oracle's signals.
//
// Real Docker. Set SKIP_DOCKER_TESTS=1 to skip where Docker is unavailable.
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import { runnerImageTag } from '../../clients/runnerImageTag.js';
import {
    acquireDockerTestLock,
    DOCKER_LOCK_WAIT_MS,
    killLeftoverRunnerContainers,
    releaseDockerTestLock,
} from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';
const RUN_TIMEOUT_MS = 60_000;
const docker = promisify(execFile);

const PYTHON_PROBE = String.raw`
import os, signal, time
word = 'denied'
try:
    with open('/proc/1/fd/1', 'w') as stream:
        word = 'opened'
        stream.write('\n{"outcome":"value","value":"FORGED","runtimeVersion":"x"}\n')
        stream.flush()
except OSError:
    pass
for name in ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2']:
    try:
        os.kill(1, getattr(signal, name))
    except OSError:
        pass
time.sleep(0.5)
print(word)
`;

const NODE_PROBE = String.raw`
const fs = await import('node:fs');
let word = 'denied';
try {
    const fd = fs.openSync('/proc/1/fd/1', 'w');
    word = 'opened';
    try {
        fs.writeSync(fd, '\n{"outcome":"value","value":"FORGED","runtimeVersion":"x"}\n');
    } finally {
        fs.closeSync(fd);
    }
} catch {}
for (const signal of ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2']) {
    try { process.kill(1, signal); } catch {}
}
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(word);
`;

const RUBY_PROBE = String.raw`
word = 'denied'
begin
    File.open('/proc/1/fd/1', 'w') do |stream|
        word = 'opened'
        stream.write("\n" + '{"outcome":"value","value":"FORGED","runtimeVersion":"x"}' + "\n")
        stream.flush
    end
rescue SystemCallError, IOError
end
%w[HUP INT QUIT TERM USR1 USR2].each do |signal|
    begin
        Process.kill(signal, 1)
    rescue SystemCallError
    end
end
sleep 0.5
puts word
`;

const GO_PROBE = String.raw`
package main

import (
    "fmt"
    "os"
    "syscall"
    "time"
)

func main() {
    word := "denied"
    stream, err := os.OpenFile("/proc/1/fd/1", os.O_WRONLY, 0)
    if err == nil {
        word = "opened"
        fmt.Fprintln(stream, "\n{\"outcome\":\"value\",\"value\":\"FORGED\",\"runtimeVersion\":\"x\"}")
        stream.Close()
    }
    for signal := 1; signal <= 31; signal++ {
        _ = syscall.Kill(1, syscall.Signal(signal))
    }
    time.Sleep(500 * time.Millisecond)
    fmt.Println(word)
}
`;

async function probePostgresStdout(): Promise<string> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const { stdout } = await docker('docker', ['ps', '-q', '--filter', `ancestor=${runnerImageTag('postgres')}`]);
        const id = stdout.trim().split('\n')[0];
        if (id) {
            const result = await docker('docker', [
                'exec',
                id,
                'sh',
                '-c',
                'printf x > /proc/1/fd/1 && echo opened || echo denied',
            ]);
            return result.stdout.trim();
        }
        await delay(200);
    }
    throw new Error('Postgres runner container did not appear within 20 seconds');
}

describe.skipIf(SKIP_DOCKER)('runOracle PID 1 isolation (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        for (const language of ['python', 'node', 'ruby', 'rails', 'go', 'postgres'] as const) {
            await ensureRunnerImage(language);
        }
    }, DOCKER_LOCK_WAIT_MS + 900_000);

    afterEach(() => {
        killLeftoverRunnerContainers();
    });

    afterAll(() => {
        releaseDockerTestLock();
    });

    it.each([
        ['python', PYTHON_PROBE],
        ['node', NODE_PROBE],
        ['ruby', RUBY_PROBE],
        ['rails', RUBY_PROBE],
    ] as const)(
        'B-1 %s denies forging PID 1 stdout and survives signals',
        async (language, code) => {
            const run = await runOracle({ language, code });

            expect(run, JSON.stringify(run)).toMatchObject({ outcome: 'value', value: 'denied' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'B-2 go denies forging PID 1 stdout and survives signals 1..31',
        async () => {
            const run = await runOracle({ language: 'go', code: GO_PROBE });

            expect(run, JSON.stringify(run)).toMatchObject({ outcome: 'value', value: 'denied' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'B-3 node keeps the inspector closed after SIGUSR1',
        async () => {
            const run = await runOracle({
                language: 'node',
                code: String.raw`
const net = await import('node:net');
try { process.kill(1, 'SIGUSR1'); } catch {}
await new Promise((resolve) => setTimeout(resolve, 1000));
const word = await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 9229 });
    const timer = setTimeout(() => finish('closed'), 1000);
    function finish(value) {
        clearTimeout(timer);
        socket.destroy();
        resolve(value);
    }
    socket.once('connect', () => finish('listening'));
    socket.once('error', () => finish('closed'));
});
console.log(word);
`,
            });

            expect(run, JSON.stringify(run)).toMatchObject({ outcome: 'value', value: 'closed' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'B-4 postgres denies a same-uid exec write to PID 1 stdout',
        async () => {
            const [run, output] = await Promise.all([
                runOracle({ language: 'postgres', code: "SELECT 'honest' FROM pg_sleep(4)" }, { timeoutMs: 6000 }),
                probePostgresStdout(),
            ]);

            expect.soft(output).toBe('denied');
            expect(run, JSON.stringify(run)).toMatchObject({ outcome: 'value', value: 'honest' });
        },
        RUN_TIMEOUT_MS,
    );
});
