import type { Question } from '@syntactical/content-schema';

import { runOracle } from '../clients/dockerRunner.js';
import type { Oracle } from '../types/Oracle.js';
import type { OracleRun } from '../types/OracleRun.js';
import type { ValidationFailureReason, ValidationResult } from '../types/ValidationResult.js';

type OracleRunner = (oracle: Oracle) => Promise<OracleRun>;

const ORACLE_RUN_COUNT = 3;

const SYNTAX_ERROR_TYPE = 'SyntaxError';

const DECIDABLE_OUTCOMES = new Set(['value', 'exception', 'syntax-error']);

function fail(reason: ValidationFailureReason): ValidationResult {
    return { reason, status: 'failed' };
}

function runKey(run: OracleRun): string {
    const { exceptionType, outcome, value } = run;
    return JSON.stringify([outcome, value ?? null, exceptionType ?? null]);
}

function observedOf(run: OracleRun): string {
    const { exceptionType, outcome, value } = run;
    if (outcome === 'value') {
        return value ?? '';
    }
    return outcome === 'exception' ? (exceptionType ?? '') : SYNTAX_ERROR_TYPE;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function choiceMatchesRun(text: string, run: OracleRun): boolean {
    const { outcome, value } = run;
    if (outcome === 'value') {
        return text.trim() === (value ?? '').trim();
    }
    return new RegExp(`\\b${escapeRegExp(observedOf(run))}\\b`).test(text);
}

async function findSnippetMatches(
    oracle: Oracle,
    snippets: string[],
    reference: OracleRun,
    run: OracleRunner,
): Promise<number[]> {
    const { language, setupSql } = oracle;
    const matches: number[] = [];
    for (const [index, code] of snippets.entries()) {
        const snippetRun = await run({ code, language, ...(setupSql === undefined ? {} : { setupSql }) });
        if (runKey(snippetRun) === runKey(reference)) {
            matches.push(index);
        }
    }
    return matches;
}

function toBoolean(text: string): boolean | undefined {
    const trimmed = text.trim();
    if (trimmed === 'True' || trimmed === 'true') {
        return true;
    }
    return trimmed === 'False' || trimmed === 'false' ? false : undefined;
}

async function findMatches(
    question: Question,
    oracle: Oracle,
    reference: OracleRun,
    run: OracleRunner,
): Promise<number[]> {
    if (!('choices' in question)) {
        const { outcome, value } = reference;
        const observed = outcome === 'value' ? toBoolean(value ?? '') : undefined;
        return observed === question.answer ? [0] : [];
    }
    if (oracle.choiceCode) {
        return findSnippetMatches(oracle, oracle.choiceCode, reference, run);
    }
    const matches: number[] = [];
    for (const [index, choice] of question.choices.entries()) {
        if (choiceMatchesRun(choice.text, reference)) {
            matches.push(index);
        }
    }
    return matches;
}

export async function validateQuestion(
    question: Question,
    oracle: Oracle | null,
    run: OracleRunner = runOracle,
): Promise<ValidationResult> {
    if (!oracle) {
        return { status: 'not-executable' };
    }
    const runs: OracleRun[] = [];
    for (let attempt = 0; attempt < ORACLE_RUN_COUNT; attempt += 1) {
        runs.push(await run(oracle));
    }
    if (runs.some((each) => !DECIDABLE_OUTCOMES.has(each.outcome))) {
        return fail('runner-error');
    }
    const [reference] = runs as [OracleRun];
    if (runs.some((each) => runKey(each) !== runKey(reference))) {
        return fail('nondeterministic');
    }
    const matches = await findMatches(question, oracle, reference, run);
    if (matches.length > 1) {
        return fail('ambiguous');
    }
    const expectedIndex = 'answerIndex' in question ? question.answerIndex : 0;
    if (matches[0] !== expectedIndex) {
        return fail('answer-mismatch');
    }
    const { runtimeVersion } = reference;
    return {
        observed: observedOf(reference),
        status: 'passed',
        ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
    };
}
