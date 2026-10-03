// Reads the timing line a benchmark program printed: the last non-empty output line, a JSON
// object whose `samples` is exactly `AB_BENCH.iterations` finite, non-negative milliseconds.
// Anything else (a snippet that wrote its own output, a short list) is no result.
import type { OracleRun } from '../../types/OracleRun.js';

import { AB_BENCH } from './AB_BENCH.js';

function parseLine(line: string): unknown {
    try {
        return JSON.parse(line);
    } catch (error) {
        // Output that is not JSON is the documented "no result" case; the caller maps it.
        console.warn('benchmark output was not valid JSON', error);
        return undefined;
    }
}

export function readBenchSamples(run: OracleRun): number[] | null {
    const { outcome, value } = run;
    if (outcome !== 'value') {
        return null;
    }
    const lines = (value ?? '').split('\n').filter((line) => line.trim() !== '');
    const last = lines[lines.length - 1];
    if (last === undefined) {
        return null;
    }
    const parsed = parseLine(last);
    const samples = typeof parsed === 'object' && parsed !== null ? (parsed as { samples?: unknown }).samples : undefined;
    const isValid =
        Array.isArray(samples) &&
        samples.length === AB_BENCH.iterations &&
        samples.every((sample) => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0);
    return isValid ? (samples as number[]) : null;
}
