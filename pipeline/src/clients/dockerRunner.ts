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
const KIBIBYTE = 1024;
const VALUE_CAP_KIBIBYTES = 64;
const RAW_OUTPUT_CAP_KIBIBYTES = 512;
const VALUE_CAP_BYTES = VALUE_CAP_KIBIBYTES * KIBIBYTE;
const RAW_OUTPUT_CAP_BYTES = RAW_OUTPUT_CAP_KIBIBYTES * KIBIBYTE;
const OOM_EXIT_CODE = 137;
const LANGUAGES: readonly string[] = ['python', 'node', 'postgres'];

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
        const { exceptionType, runtimeVersion, value } = record;
        const outcome = OUTCOMES.find((candidate) => candidate === record.outcome);
        if (!outcome) {
            return undefined;
        }
        const run: OracleRun = { outcome };
        if (typeof value === 'string') run.value = value;
        if (typeof exceptionType === 'string') run.exceptionType = exceptionType;
        if (typeof runtimeVersion === 'string') run.runtimeVersion = runtimeVersion;
        return run;
    } catch (err) {
        // Unparseable runner output is the documented "no result" case; the caller maps it.
        console.warn('oracle runner output was not valid JSON', err);
        return undefined;
    }
}

function applyValueCap(run: OracleRun): OracleRun {
    const { outcome, runtimeVersion, value } = run;
    if (outcome === 'value' && Buffer.byteLength(value ?? '') > VALUE_CAP_BYTES) {
        return { outcome: 'resource-limit', runtimeVersion };
    }
    return run;
}

export async function runOracle(oracle: Oracle, limits: RunLimits = {}): Promise<OracleRun> {
    const { code: oracleCode, language, setupSql } = oracle;
    // The type is a closed union, but the language later builds a filesystem path, so the
    // runtime value is checked before anything touches Docker or the disk.
    if (!LANGUAGES.includes(language)) {
        return { exceptionType: 'RunnerFailure', outcome: 'exception' };
    }
    await ensureRunnerImage(language);
    const timeoutMs = Math.min(limits.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const args = buildDockerArgs(oracle, runnerImageTag(language));
    const payload = JSON.stringify({
        code: oracleCode,
        language,
        setupSql,
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
            resolve({ exceptionType: 'RunnerFailure', outcome: 'exception' });
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
                resolve({ exceptionType: 'RunnerFailure', outcome: 'exception' });
            }
        });
    });
}
