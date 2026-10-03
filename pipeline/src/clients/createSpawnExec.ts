// Runs a command as an argument vector with its input on stdin, a hard SIGKILL
// timeout, and a stdout cap. Failures name the cause only: never argv, the
// input, or the child's stderr, which may echo the prompt.
import { spawn } from 'node:child_process';

import type { ExecFn } from '../types/ExecFn.js';

export interface SpawnExecLimits {
    maxStdoutBytes: number;
    timeoutMs: number;
}

export function createSpawnExec(limits: SpawnExecLimits): ExecFn {
    const { maxStdoutBytes, timeoutMs } = limits;
    return function spawnExec(file, args, options) {
        const { cwd, env, input } = options;
        return new Promise((resolve, reject) => {
            const child = spawn(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });
            const chunks: Buffer[] = [];
            let received = 0;
            let failure: Error | undefined;
            function fail(error: Error): void {
                failure ??= error;
                child.kill('SIGKILL');
            }
            const timer = setTimeout(() => fail(new Error(`${file} timed out after ${timeoutMs} ms`)), timeoutMs);
            child.stdout.on('data', (chunk: Buffer) => {
                received += chunk.length;
                if (received > maxStdoutBytes) {
                    fail(new Error(`${file} output exceeded ${maxStdoutBytes} bytes`));
                    return;
                }
                chunks.push(chunk);
            });
            child.on('error', (error) => {
                clearTimeout(timer);
                reject(new Error(`${file} could not start: ${error.message}`));
            });
            child.on('close', (code) => {
                clearTimeout(timer);
                if (failure) {
                    reject(failure);
                } else if (code !== 0) {
                    reject(new Error(`${file} exited with status ${String(code)}`));
                } else {
                    resolve({ stdout: Buffer.concat(chunks).toString('utf8') });
                }
            });
            child.stdin.on('error', () => undefined);
            child.stdin.end(input);
        });
    };
}
