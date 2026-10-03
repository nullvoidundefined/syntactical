// B-51 (evidence): a correctness A/B card passes only when the option its answer index names
// matches every edge case and the other option fails one; the failing case is the evidence.
// The runner is a fake; the screen (`findRefusedConstruct`) is the real one.
import type { Provenance } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { validateCorrectnessAb } from '../../../services/ab/validateCorrectnessAb.js';
import type { Oracle } from '../../../types/Oracle.js';
import type { OracleRun } from '../../../types/OracleRun.js';
import type { AbEdgeCase } from '../../../types/ab/AbEdgeCase.js';
import type { AbQuestion } from '../../../types/ab/AbQuestion.js';

const PROVENANCE: Provenance = {
    isHumanReviewed: false,
    source: 'original',
    validation: { method: 'executed', status: 'pending' },
};

const GOOD = "function head(xs) { return xs.length === 0 ? 'none' : xs[0]; }";
const CRASHES = 'function head(xs) { return xs[0].toString(); }';
const WRONG = 'function head(xs) { return xs.length === 0 ? "none" : xs[1]; }';
const NODE = { language: 'node' } as const;
const NODE_VERSION = 'Node 22.11.0';

const EDGE_CASES: AbEdgeCase[] = [
    { call: 'console.log(head([1, 2]));', expected: '1', input: '[1, 2]' },
    { call: 'console.log(head([]));', expected: 'none', input: '[]' },
];

function buildQuestion(optionA: string, optionB: string, answerIndex: 0 | 1 = 0): AbQuestion {
    return {
        answerIndex,
        choices: [
            { code: optionA, text: 'A' },
            { code: optionB, text: 'B' },
        ],
        criterion: { evidence: 'pending', statement: 'Handles every input', type: 'correctness' },
        id: 'q-ab',
        prompt: 'Which is correct?',
        provenance: PROVENANCE,
        query: { explanation: 'e', title: 't' },
        type: 'ab',
    };
}

// Behaves like the three head() variants: GOOD is right everywhere, CRASHES throws on [],
// WRONG answers the wrong element.
function fakeRunner(): { calls: Oracle[]; run: (oracle: Oracle) => Promise<OracleRun> } {
    const calls: Oracle[] = [];
    async function run(oracle: Oracle): Promise<OracleRun> {
        calls.push(oracle);
        const { code } = oracle;
        const isEmptyCase = code.includes('head([])');
        if (code.includes(CRASHES)) {
            return isEmptyCase
                ? { exceptionType: 'IndexError', outcome: 'exception', runtimeVersion: NODE_VERSION }
                : { outcome: 'value', runtimeVersion: NODE_VERSION, value: '1' };
        }
        if (code.includes(WRONG)) {
            return { outcome: 'value', runtimeVersion: NODE_VERSION, value: isEmptyCase ? 'none' : '2' };
        }
        return { outcome: 'value', runtimeVersion: NODE_VERSION, value: isEmptyCase ? 'none' : '1' };
    }
    return { calls, run };
}

describe('validateCorrectnessAb', () => {
    it('passes when the optimal option handles every case and the other fails one, naming that case', async () => {
        const { run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion(GOOD, CRASHES), EDGE_CASES, NODE, run);
        expect(result).toEqual({
            evidence: 'Fails for input []: IndexError',
            method: 'executed',
            runtimeVersion: NODE_VERSION,
            status: 'passed',
        });
    });

    it('names the other option when the answer index points at B', async () => {
        const { run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion(CRASHES, GOOD, 1), EDGE_CASES, NODE, run);
        expect(result.status).toBe('passed');
        expect(result.evidence).toBe('Fails for input []: IndexError');
    });

    it('reports a wrong value as expected versus got', async () => {
        const { run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion(GOOD, WRONG), EDGE_CASES, NODE, run);
        expect(result.evidence).toBe('Fails for input [1, 2]: expected 1, got 2');
    });

    it('fails with no-distinguishing-case when both options pass every case', async () => {
        const { run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion(GOOD, `${GOOD} // twin`), EDGE_CASES, NODE, run);
        expect(result).toMatchObject({ reason: 'no-distinguishing-case', status: 'failed' });
        expect(result.evidence).toBeUndefined();
    });

    it('fails with neither-correct when both options fail a case', async () => {
        const { run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion(CRASHES, WRONG), EDGE_CASES, NODE, run);
        expect(result).toMatchObject({ reason: 'neither-correct', status: 'failed' });
    });

    it('fails with answer-mismatch when the option marked optimal is the one that fails', async () => {
        const { run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion(CRASHES, GOOD, 0), EDGE_CASES, NODE, run);
        expect(result).toMatchObject({ reason: 'answer-mismatch', status: 'failed' });
    });

    it('runs each program as the option code followed by the edge-case call', async () => {
        const { calls, run } = fakeRunner();
        await validateCorrectnessAb(buildQuestion(GOOD, CRASHES), EDGE_CASES, NODE, run);
        expect(calls[0]).toEqual({ code: `${GOOD}\nconsole.log(head([1, 2]));`, language: 'node' });
        expect(calls.some(({ code }) => code === `${CRASHES}\nconsole.log(head([]));`)).toBe(true);
    });

    it('never runs a program the construct screen refuses', async () => {
        const { calls, run } = fakeRunner();
        const hostile = 'function head(xs) { return process.env.HOME; }';
        const result = await validateCorrectnessAb(buildQuestion(GOOD, hostile), EDGE_CASES, NODE, run);
        expect(result).toMatchObject({ reason: 'refused', status: 'failed' });
        expect(calls.some(({ code }) => code.includes('process.env'))).toBe(false);
    });

    it('fails with runner-error when the sandbox itself failed', async () => {
        const result = await validateCorrectnessAb(buildQuestion(GOOD, CRASHES), EDGE_CASES, NODE, async () => ({
            exceptionType: 'RunnerFailure',
            outcome: 'exception',
        }));
        expect(result).toMatchObject({ reason: 'runner-error', status: 'failed' });
    });

    it('counts a timeout as a failing case, not a runner error', async () => {
        const run = async (oracle: Oracle): Promise<OracleRun> =>
            oracle.code.includes(CRASHES) ? { outcome: 'timeout' } : { outcome: 'value', value: oracle.code.includes('head([])') ? 'none' : '1' };
        const result = await validateCorrectnessAb(buildQuestion(GOOD, CRASHES), EDGE_CASES, NODE, run);
        expect(result).toMatchObject({ evidence: 'Fails for input [1, 2]: timeout', status: 'passed' });
    });

    it('refuses Postgres without running anything', async () => {
        const { calls, run } = fakeRunner();
        const result = await validateCorrectnessAb(buildQuestion('SELECT 1', 'SELECT 2'), EDGE_CASES, { language: 'postgres' }, run);
        expect(result).toMatchObject({ reason: 'unsupported-language', status: 'failed' });
        expect(calls).toHaveLength(0);
    });

    it('fails with missing-code when an option has no code, and with no-edge-cases when none are given', async () => {
        const { run } = fakeRunner();
        const noCode = buildQuestion(GOOD, CRASHES);
        delete noCode.choices[1].code;
        expect((await validateCorrectnessAb(noCode, EDGE_CASES, NODE, run)).reason).toBe('missing-code');
        expect((await validateCorrectnessAb(buildQuestion(GOOD, CRASHES), [], NODE, run)).reason).toBe('no-edge-cases');
    });
});
