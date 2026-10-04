// Validates a correctness A/B card by executing both options against edge cases. Every
// program runs only through the sandboxed runner. The card passes when the option its
// `answerIndex` names matches the expected output on every edge case and the other option fails at least one; the first failing
// edge case of the other option becomes the card's evidence. Python and Node only: an
// option is code followed by a call, which has no Postgres equivalent.
import { runOracle } from '../../clients/dockerRunner.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';
import type { OracleRunner } from '../../types/OracleRunner.js';
import type { AbEdgeCase } from '../../types/ab/AbEdgeCase.js';
import type { AbFailureReason } from '../../types/ab/AbFailureReason.js';
import type { AbQuestion } from '../../types/ab/AbQuestion.js';
import type { AbSource } from '../../types/ab/AbSource.js';
import type { AbValidationResult } from '../../types/ab/AbValidationResult.js';

import { readAbSnippets } from './readAbSnippets.js';

const SYNTAX_ERROR_TYPE = 'SyntaxError';
const RUNNER_FAILURE = 'RunnerFailure';
const UNEXECUTABLE_LANGUAGES = new Set(['postgres']);

// One option's result over every edge case: it passes, fails a case (with evidence), or could
// not be judged at all (`reason`).
interface OptionVerdict {
    evidence?: string;
    isPassing: boolean;
    reason?: AbFailureReason;
    runtimeVersion?: string;
}

function fail(reason: AbFailureReason): AbValidationResult {
    return { method: 'executed', reason, status: 'failed' };
}

function describeMiss(run: OracleRun, expected: string): string {
    const { exceptionType, outcome, value } = run;
    if (outcome === 'value') {
        return `expected ${expected}, got ${value ?? ''}`;
    }
    if (outcome === 'exception') {
        return exceptionType ?? RUNNER_FAILURE;
    }
    return outcome === 'syntax-error' ? SYNTAX_ERROR_TYPE : outcome;
}

function matchesExpected(run: OracleRun, expected: string): boolean {
    const { outcome, value } = run;
    return outcome === 'value' && (value ?? '').trim() === expected.trim();
}

async function judgeOption(
    snippet: string,
    edgeCases: readonly AbEdgeCase[],
    source: AbSource,
    run: OracleRunner,
): Promise<OptionVerdict> {
    const { language, setupSql } = source;
    let runtimeVersion: string | undefined;
    for (const { call, expected, input } of edgeCases) {
        const oracle: Oracle = { code: `${snippet}\n${call}`, language, ...(setupSql === undefined ? {} : { setupSql }) };
        const result = await run(oracle);
        const { exceptionType, outcome, runtimeVersion: reported } = result;
        if (outcome === 'exception' && exceptionType === RUNNER_FAILURE) {
            return { isPassing: false, reason: 'runner-error' };
        }
        runtimeVersion = reported ?? runtimeVersion;
        if (!matchesExpected(result, expected)) {
            return {
                evidence: `Fails for input ${input}: ${describeMiss(result, expected)}`,
                isPassing: false,
                ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
            };
        }
    }
    return { isPassing: true, ...(runtimeVersion === undefined ? {} : { runtimeVersion }) };
}

function decide(verdicts: [OptionVerdict, OptionVerdict], answerIndex: 0 | 1): AbValidationResult {
    const optimal = verdicts[answerIndex];
    const other = verdicts[answerIndex === 0 ? 1 : 0];
    const { isPassing: isOptimalPassing, reason: optimalReason, runtimeVersion: optimalVersion } = optimal;
    const { evidence, isPassing: isOtherPassing, reason: otherReason, runtimeVersion: otherVersion } = other;
    const unjudged = optimalReason ?? otherReason;
    if (unjudged !== undefined) return fail(unjudged);
    if (!isOptimalPassing) return fail(isOtherPassing ? 'answer-mismatch' : 'neither-correct');
    if (isOtherPassing) return fail('no-distinguishing-case');
    const runtimeVersion = optimalVersion ?? otherVersion;
    return {
        method: 'executed',
        status: 'passed',
        ...(evidence === undefined ? {} : { evidence }),
        ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
    };
}

export async function validateCorrectnessAb(
    question: AbQuestion,
    edgeCases: readonly AbEdgeCase[],
    source: AbSource,
    run: OracleRunner = runOracle,
): Promise<AbValidationResult> {
    if (UNEXECUTABLE_LANGUAGES.has(source.language)) {
        return fail('unsupported-language');
    }
    const snippets = readAbSnippets(question);
    if (snippets === null) {
        return fail('missing-code');
    }
    if (edgeCases.length === 0) {
        return fail('no-edge-cases');
    }
    const verdictA = await judgeOption(snippets[0], edgeCases, source, run);
    const verdictB = await judgeOption(snippets[1], edgeCases, source, run);
    return decide([verdictA, verdictB], question.answerIndex);
}
