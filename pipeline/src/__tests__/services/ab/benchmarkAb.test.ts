// B-52: a performance A/B card is published only when the optimal option's median beats the
// other's by at least AB_MIN_RATIO on two separate runs of AB_BENCH.iterations. The runner is a
// fake that answers with canned timings; it identifies the option from the base64 the wrapper
// embeds, so a swapped option would change the verdict.
import type { Provenance } from '@syntactical/content-schema';
import { describe, expect, it, vi } from 'vitest';

import { AB_BENCH } from '../../../services/ab/AB_BENCH.js';
import { AB_MIN_RATIO } from '../../../services/ab/AB_MIN_RATIO.js';
import { benchmarkAb } from '../../../services/ab/benchmarkAb.js';
import type { Oracle } from '../../../types/Oracle.js';
import type { OracleRun } from '../../../types/OracleRun.js';
import type { RunLimits } from '../../../types/RunLimits.js';
import type { AbQuestion } from '../../../types/ab/AbQuestion.js';

const PROVENANCE: Provenance = {
    isHumanReviewed: false,
    source: 'original',
    validation: { method: 'executed', status: 'pending' },
};

const OPTION_A = 'let total = 0; for (let i = 0; i < 1000; i += 1) { total += i; }';
const OPTION_B = 'const items = []; for (let i = 0; i < 1000; i += 1) { items.push(i); }';
const NODE = { language: 'node' } as const;
const VERSION = 'Node v22.11.0';

function toBase64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
}

function buildQuestion(answerIndex: 0 | 1): AbQuestion {
    return {
        answerIndex,
        choices: [
            { code: OPTION_A, text: 'A' },
            { code: OPTION_B, text: 'B' },
        ],
        criterion: { evidence: 'pending', statement: 'Lower median runtime wins', type: 'performance' },
        id: 'q-ab',
        prompt: 'Which is faster?',
        provenance: PROVENANCE,
        query: { explanation: 'e', title: 't' },
        type: 'ab',
    };
}

function timings(median: number): OracleRun {
    const samples = Array.from({ length: AB_BENCH.iterations }, () => median);
    return { outcome: 'value', runtimeVersion: VERSION, value: JSON.stringify({ samples }) };
}

type Medians = { a: number[]; b: number[] };

// Serves one canned median per call of each option, in call order.
function fakeRunner(medians: Medians, snippets: [string, string] = [OPTION_A, OPTION_B]) {
    const calls: { limits: RunLimits | undefined; oracle: Oracle }[] = [];
    const cursor = { a: 0, b: 0 };
    async function run(oracle: Oracle, limits?: RunLimits): Promise<OracleRun> {
        calls.push({ limits, oracle });
        const haystack = `${oracle.code}\n${oracle.setupSql ?? ''}`;
        const key = haystack.includes(toBase64(snippets[0].trim().replace(/;+$/, ''))) ? 'a' : 'b';
        const median = medians[key][cursor[key]] as number;
        cursor[key] += 1;
        return timings(median);
    }
    return { calls, run };
}

describe('benchmarkAb', () => {
    it('publishes when the optimal option wins by the ratio on both runs and writes the evidence line', async () => {
        const { run } = fakeRunner({ a: [1.2, 1.2], b: [9.8, 9.8] });
        const result = await benchmarkAb(buildQuestion(0), NODE, run);
        expect(result).toEqual({
            evidence: 'A: 1.2 ms, B: 9.8 ms median on Node 22.11.0',
            method: 'executed',
            runtimeVersion: VERSION,
            status: 'passed',
        });
    });

    it('refuses an unstable result: 2.1x on one run and 1.6x on the other', async () => {
        const { run } = fakeRunner({ a: [1, 1], b: [2.1, 1.6] });
        expect(await benchmarkAb(buildQuestion(0), NODE, run)).toMatchObject({ reason: 'unstable', status: 'failed' });
    });

    it('refuses when the two runs disagree about which option is faster', async () => {
        const { run } = fakeRunner({ a: [1, 5], b: [5, 1] });
        expect(await benchmarkAb(buildQuestion(0), NODE, run)).toMatchObject({ reason: 'unstable', status: 'failed' });
    });

    it('refuses a gap under the ratio on every run as no-clear-winner', async () => {
        const { run } = fakeRunner({ a: [1, 1], b: [1.9, 1.6] });
        expect(await benchmarkAb(buildQuestion(0), NODE, run)).toMatchObject({ reason: 'no-clear-winner', status: 'failed' });
    });

    it('treats a gap of exactly AB_MIN_RATIO as enough and one hair under as not', async () => {
        const exact = fakeRunner({ a: [1, 1], b: [AB_MIN_RATIO, AB_MIN_RATIO] });
        expect((await benchmarkAb(buildQuestion(0), NODE, exact.run)).status).toBe('passed');
        const under = fakeRunner({ a: [1, 1], b: [AB_MIN_RATIO - 0.01, AB_MIN_RATIO - 0.01] });
        expect(await benchmarkAb(buildQuestion(0), NODE, under.run)).toMatchObject({ reason: 'no-clear-winner' });
    });

    it('refuses identical medians', async () => {
        const { run } = fakeRunner({ a: [3, 3], b: [3, 3] });
        expect(await benchmarkAb(buildQuestion(0), NODE, run)).toMatchObject({ reason: 'no-clear-winner' });
    });

    it('does not let medians under the noise floor manufacture a large ratio', async () => {
        const tiny = AB_BENCH.noiseFloorMs / 10;
        const { run } = fakeRunner({ a: [tiny, tiny], b: [tiny * 4, tiny * 4] });
        expect(await benchmarkAb(buildQuestion(0), NODE, run)).toMatchObject({ reason: 'no-clear-winner' });
    });

    it('fails with answer-mismatch when the card names the slower option', async () => {
        const { run } = fakeRunner({ a: [1, 1], b: [9, 9] });
        expect(await benchmarkAb(buildQuestion(1), NODE, run)).toMatchObject({ reason: 'answer-mismatch' });
    });

    it('names option B correctly when it is the faster one', async () => {
        const { run } = fakeRunner({ a: [8, 8], b: [2, 2] });
        const result = await benchmarkAb(buildQuestion(1), NODE, run);
        expect(result).toMatchObject({ evidence: 'A: 8.0 ms, B: 2.0 ms median on Node 22.11.0', status: 'passed' });
    });

    it('reports the run with the smallest gap', async () => {
        const { run } = fakeRunner({ a: [1, 2], b: [10, 5] });
        expect((await benchmarkAb(buildQuestion(0), NODE, run)).evidence).toBe('A: 2.0 ms, B: 5.0 ms median on Node 22.11.0');
    });

    it('takes the median of the samples, so an outlier does not decide', async () => {
        let call = 0;
        const run = async (): Promise<OracleRun> => {
            call += 1;
            const isFast = call % 2 === 1;
            const base = isFast ? 1 : 10;
            const samples = Array.from({ length: AB_BENCH.iterations }, (_, index) => (index < 2 ? 5000 : base));
            return { outcome: 'value', runtimeVersion: VERSION, value: JSON.stringify({ samples }) };
        };
        const result = await benchmarkAb(buildQuestion(0), NODE, run);
        expect(result.evidence).toBe('A: 1.0 ms, B: 10.0 ms median on Node 22.11.0');
    });

    it('runs every option AB_BENCH.runs times, alternating A and B, under the fixed limits', async () => {
        const { calls, run } = fakeRunner({ a: [1, 1], b: [9, 9] });
        await benchmarkAb(buildQuestion(0), NODE, run);
        expect(calls).toHaveLength(AB_BENCH.runs * 2);
        expect(calls.map(({ oracle }) => oracle.code.includes(toBase64(OPTION_A)))).toEqual([true, false, true, false]);
        expect(calls.every(({ limits }) => limits?.timeoutMs === AB_BENCH.timeoutMs)).toBe(true);
        expect(calls[0]?.oracle.code).toContain(`${AB_BENCH.warmup + AB_BENCH.iterations}`);
    });

    it('benchmarks Postgres through EXPLAIN ANALYZE against the card fixture', async () => {
        const sqlA = 'SELECT count(*) FROM t';
        const sqlB = 'SELECT count(id) FROM t WHERE id > 0;';
        const fixture = 'CREATE TABLE t (id int);';
        const question = buildQuestion(0);
        question.choices[0].code = sqlA;
        question.choices[1].code = sqlB;
        const { calls, run } = fakeRunner({ a: [1, 1], b: [9, 9] }, [sqlA, sqlB]);
        const result = await benchmarkAb(question, { language: 'postgres', setupSql: fixture }, run);
        expect(result).toMatchObject({ evidence: 'A: 1.0 ms, B: 9.0 ms median on Node 22.11.0', status: 'passed' });
        const [first] = calls;
        expect(first?.oracle.code).toBe('SELECT bench_samples()');
        expect(first?.oracle.setupSql).toContain(fixture);
        expect(first?.oracle.setupSql).toContain('EXPLAIN (ANALYZE, FORMAT JSON)');
        expect(first?.oracle.setupSql).toContain(toBase64(sqlA));
        // A trailing semicolon would break the EXECUTE, so the option is sent without it.
        expect(calls[1]?.oracle.setupSql).toContain(toBase64('SELECT count(id) FROM t WHERE id > 0'));
    });

    it('fails with runner-error when a run times out, prints nothing usable, or reports no version', async () => {
        const badRuns: OracleRun[] = [
            { outcome: 'timeout' },
            { outcome: 'value', runtimeVersion: VERSION, value: 'not json' },
            { outcome: 'value', runtimeVersion: VERSION, value: JSON.stringify({ samples: [1, 2, 3] }) },
            { outcome: 'value', runtimeVersion: VERSION, value: JSON.stringify({ samples: Array.from({ length: AB_BENCH.iterations }, () => -1) }) },
            { ...timings(1), runtimeVersion: undefined },
            { exceptionType: 'RunnerFailure', outcome: 'exception' },
        ];
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        for (const bad of badRuns) {
            const result = await benchmarkAb(buildQuestion(0), NODE, async () => bad);
            expect(result).toMatchObject({ reason: 'runner-error', status: 'failed' });
        }
    });

    it('refuses a run whose two options report different runtimes', async () => {
        let call = 0;
        const run = async (): Promise<OracleRun> => {
            call += 1;
            return { ...timings(call % 2 === 1 ? 1 : 9), runtimeVersion: call % 2 === 1 ? 'Node v22.11.0' : 'Node v24.1.0' };
        };
        expect(await benchmarkAb(buildQuestion(0), NODE, run)).toMatchObject({ reason: 'runner-error' });
    });

    it('never benchmarks an option the construct screen refuses', async () => {
        const { calls, run } = fakeRunner({ a: [1, 1], b: [9, 9] });
        const hostile = buildQuestion(0);
        hostile.choices[1].code = 'process.exit(0);';
        expect(await benchmarkAb(hostile, NODE, run)).toMatchObject({ reason: 'refused' });
        expect(calls).toHaveLength(0);
    });
});
