import { spawn } from 'node:child_process';

import type { Oracle } from '../types/Oracle.js';
import type { OracleOutcome, OracleRun } from '../types/OracleRun.js';
import type { RunLimits } from '../types/RunLimits.js';
import { buildDockerArgs } from './buildDockerArgs.js';
import { ensureRunnerImage } from './ensureRunnerImage.js';
import { runnerImageTag } from './runnerImageTag.js';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 6000;
const KILL_GRACE_MS = 1000;
const VALUE_CAP_BYTES = 64 * 1024;
const RAW_OUTPUT_CAP_BYTES = 512 * 1024;
const OOM_EXIT_CODE = 137;

const OUTCOMES: OracleOutcome[] = [
    'value',
    'exception',
    'syntax-error',
    'timeout',
    'resource-limit',
];

function parseResult(stdout: string): OracleRun | undefined {
    const lines = stdout.split('\n').filter((line) => line.trim() !== '');
    const last = lines[lines.length - 1];
    if (last === undefined) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(last);
        if (typeof parsed !== 'object' || parsed === null) {
            return undefined;
        }
        const record = parsed as Record<string, unknown>;
        const outcome = OUTCOMES.find((candidate) => candidate === record.outcome);
        if (!outcome) {
            return undefined;
        }
        const run: OracleRun = { outcome };
        if (typeof record.value === 'string') run.value = record.value;
        if (typeof record.exceptionType === 'string') run.exceptionType = record.exceptionType;
        if (typeof record.runtimeVersion === 'string') run.runtimeVersion = record.runtimeVersion;
        return run;
    } catch {
        return undefined;
    }
}

function applyValueCap(run: OracleRun): OracleRun {
    if (run.outcome === 'value' && Buffer.byteLength(run.value ?? '') > VALUE_CAP_BYTES) {
        return { outcome: 'resource-limit', runtimeVersion: run.runtimeVersion };
    }
    return run;
}

export async function runOracle(oracle: Oracle, limits: RunLimits = {}): Promise<OracleRun> {
    await ensureRunnerImage(oracle.language);
    const timeoutMs = Math.min(limits.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const args = buildDockerArgs(oracle, runnerImageTag(oracle.language));
    const payload = JSON.stringify({
        language: oracle.language,
        code: oracle.code,
        setupSql: oracle.setupSql,
        timeoutMs,
    });

    return new Promise<OracleRun>((resolve) => {
        const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'ignore'] });
        const chunks: Buffer[] = [];
        let received = 0;
        let capExceeded = false;
        let killedByUs = false;
        const timers: NodeJS.Timeout[] = [];

        function terminate(): void {
            if (killedByUs) return;
            killedByUs = true;
            child.kill('SIGTERM');
            timers.push(setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS));
        }

        timers.push(setTimeout(terminate, timeoutMs + KILL_GRACE_MS));

        child.stdin.on('error', () => undefined);
        child.stdin.end(payload);

        child.stdout.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > RAW_OUTPUT_CAP_BYTES) {
                capExceeded = true;
                terminate();
                return;
            }
            chunks.push(chunk);
        });

        child.on('error', () => {
            timers.forEach(clearTimeout);
            resolve({ outcome: 'exception', exceptionType: 'RunnerFailure' });
        });

        child.on('close', (code) => {
            timers.forEach(clearTimeout);
            if (capExceeded) {
                resolve({ outcome: 'resource-limit' });
                return;
            }
            const run = parseResult(Buffer.concat(chunks).toString('utf8'));
            if (run) {
                resolve(applyValueCap(run));
            } else if (killedByUs) {
                resolve({ outcome: 'timeout' });
            } else if (code === OOM_EXIT_CODE) {
                resolve({ outcome: 'resource-limit' });
            } else {
                resolve({ outcome: 'exception', exceptionType: 'RunnerFailure' });
            }
        });
    });
}
