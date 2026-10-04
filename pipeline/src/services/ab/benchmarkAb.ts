// Validates a performance A/B card by timing both options. Each option runs in its own
// sandboxed run (only through the injected runner, `runOracle` in production) of
// `AB_BENCH.iterations` measured executions, and the pair is measured `AB_BENCH.runs`
// times. A winner is named only when the same option has the faster median on every run,
// the gap is at least `AB_MIN_RATIO` on every run, and that option is the one the card's
// `answerIndex` names. Anything else refuses to pick a winner: runs that disagree or
// straddle the threshold are `unstable`, a gap under the threshold on every run is
// `no-clear-winner`. Medians below `AB_BENCH.noiseFloorMs` are raised to it before the
// ratio, so timer-resolution jitter cannot manufacture a gap.
import { runOracle } from '../../clients/dockerRunner.js';
import type { OracleRunner } from '../../types/OracleRunner.js';
import type { AbFailureReason } from '../../types/ab/AbFailureReason.js';
import type { AbQuestion } from '../../types/ab/AbQuestion.js';
import type { AbSource } from '../../types/ab/AbSource.js';
import type { AbValidationResult } from '../../types/ab/AbValidationResult.js';

import { AB_BENCH } from './AB_BENCH.js';
import { AB_MIN_RATIO } from './AB_MIN_RATIO.js';
import { buildBenchOracle } from './buildBenchOracle.js';
import { medianOf } from './medianOf.js';
import { readAbSnippets } from './readAbSnippets.js';
import { readBenchSamples } from './readBenchSamples.js';

const MS_DECIMALS = 1;
const SMALL_MS_DECIMALS = 3;
const SMALL_MS_LIMIT = 0.1;
const VERSION_PREFIX = /^(\S+) v(?=\d)/;

type Measure = { median: number; runtimeVersion: string };
type Round = { medians: [number, number]; runtimeVersion: string };

function fail(reason: AbFailureReason): AbValidationResult {
    return { method: 'executed', reason, status: 'failed' };
}

function formatMs(value: number): string {
    return value.toFixed(value < SMALL_MS_LIMIT ? SMALL_MS_DECIMALS : MS_DECIMALS);
}

// The Node runner reports "Node v22.11.0"; the card reads "Node 22.11.0".
function formatVersion(runtimeVersion: string): string {
    return runtimeVersion.replace(VERSION_PREFIX, '$1 ');
}

async function measureOption(snippet: string, source: AbSource, run: OracleRunner): Promise<Measure | null> {
    const oracle = buildBenchOracle(snippet, source);
    if (oracle === null) return null;
    const result = await run(oracle, { timeoutMs: AB_BENCH.timeoutMs });
    const samples = readBenchSamples(result);
    const { runtimeVersion } = result;
    if (samples === null || runtimeVersion === undefined) {
        return null;
    }
    return { median: medianOf(samples), runtimeVersion };
}

async function measureRound(snippets: [string, string], source: AbSource, run: OracleRunner): Promise<Round | null> {
    const first = await measureOption(snippets[0], source, run);
    if (first === null) {
        return null;
    }
    const second = await measureOption(snippets[1], source, run);
    if (second === null) {
        return null;
    }
    const { median: firstMedian, runtimeVersion } = first;
    const { median: secondMedian, runtimeVersion: secondVersion } = second;
    return runtimeVersion === secondVersion ? { medians: [firstMedian, secondMedian], runtimeVersion } : null;
}

function summarizeRound({ medians }: Round): { faster: 0 | 1 | null; ratio: number } {
    const [first, second] = medians.map((median) => Math.max(median, AB_BENCH.noiseFloorMs)) as [number, number];
    const ratio = Math.max(first, second) / Math.min(first, second);
    if (first === second) {
        return { faster: null, ratio };
    }
    return { faster: first < second ? 0 : 1, ratio };
}

function judgeRounds(rounds: Round[], answerIndex: 0 | 1): AbValidationResult {
    const summaries = rounds.map(summarizeRound);
    if (new Set(rounds.map(({ runtimeVersion }) => runtimeVersion)).size > 1) {
        return fail('unstable');
    }
    if (summaries.some(({ faster }) => faster === null)) {
        return fail('no-clear-winner');
    }
    if (new Set(summaries.map(({ faster }) => faster)).size > 1) {
        return fail('unstable');
    }
    const meetingCount = summaries.filter(({ ratio }) => ratio >= AB_MIN_RATIO).length;
    if (meetingCount === 0) {
        return fail('no-clear-winner');
    }
    if (meetingCount < summaries.length) {
        return fail('unstable');
    }
    if (summaries[0]?.faster !== answerIndex) {
        return fail('answer-mismatch');
    }
    // The weakest run is the one reported, so the card never shows a more flattering gap than it earned.
    const weakest = rounds.reduce((best, round) => (summarizeRound(round).ratio < summarizeRound(best).ratio ? round : best));
    const [first, second] = weakest.medians;
    const { runtimeVersion } = weakest;
    return {
        evidence: `A: ${formatMs(first)} ms, B: ${formatMs(second)} ms median on ${formatVersion(runtimeVersion)}`,
        method: 'executed',
        runtimeVersion,
        status: 'passed',
    };
}

export async function benchmarkAb(
    question: AbQuestion,
    source: AbSource,
    run: OracleRunner = runOracle,
): Promise<AbValidationResult> {
    const snippets = readAbSnippets(question);
    if (snippets === null) {
        return fail('missing-code');
    }
    const rounds: Round[] = [];
    for (let index = 0; index < AB_BENCH.runs; index += 1) {
        const round = await measureRound(snippets, source, run);
        if (round === null) {
            return fail('runner-error');
        }
        rounds.push(round);
    }
    return judgeRounds(rounds, question.answerIndex);
}
