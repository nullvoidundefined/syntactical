// B-9, B-10, B-11, B-12 (validator level): `validateQuestion` decides a
// question's correctness from its oracle's executed output, never from a model.
// The oracle runs exactly three times; any disagreement in outcome, value, or
// exception type rejects as `nondeterministic`; a runner failure (timeout,
// sandbox violation, resource limit) on any run rejects as `runner-error`.
// The observed value is compared with each choice's trimmed text: one match at
// `answerIndex` passes, one match elsewhere or none is `answer-mismatch`, two
// or more matches is `ambiguous`. A raised exception matches a choice naming
// its type as a whole word (B-12); a syntax error matches a choice naming
// SyntaxError. With `oracle.choiceCode`, each choice's snippet is executed and
// the choice whose output equals the oracle's output is the match. A `bool`
// question maps True/true and False/false onto its `answer`. No oracle means
// `not-executable`. The runner is injected; no Docker here.
import type { Choice, Criterion, Provenance, Question, Query } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { validateQuestion } from '../../services/validateQuestion.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';
import type { ValidationResult } from '../../types/ValidationResult.js';

const PYTHON = 'Python 3.13.16';

const QUERY: Query = { title: 'A title', explanation: 'An explanation.' };

const PROVENANCE: Provenance = {
    source: 'original',
    validation: { method: 'executed', status: 'pending' },
    isHumanReviewed: false,
};

const CRITERION: Criterion = {
    type: 'correctness',
    statement: 'The executed output decides.',
    evidence: 'Oracle output.',
};

function toChoices(texts: string[]): Choice[] {
    return texts.map((text) => ({ text }));
}

function buildMc(texts: string[], answerIndex: number): Question {
    return {
        id: 'q-mc',
        type: 'mc',
        prompt: 'What does this print?',
        code: 'print(x)',
        query: QUERY,
        provenance: PROVENANCE,
        choices: toChoices(texts),
        answerIndex,
    };
}

function buildAb(texts: [string, string], answerIndex: 0 | 1): Question {
    return {
        id: 'q-ab',
        type: 'ab',
        prompt: 'Which does this print?',
        code: 'print(x)',
        query: QUERY,
        provenance: PROVENANCE,
        choices: [{ text: texts[0] }, { text: texts[1] }],
        answerIndex,
        criterion: CRITERION,
    };
}

function buildBool(answer: boolean): Question {
    return {
        id: 'q-bool',
        type: 'bool',
        prompt: 'This prints True.',
        code: 'print(x)',
        query: QUERY,
        provenance: PROVENANCE,
        answer,
    };
}

function buildOracle(overrides: Partial<Oracle> = {}): Oracle {
    return { language: 'python', code: 'print(x)', ...overrides };
}

function value(text: string): OracleRun {
    return { outcome: 'value', value: text, runtimeVersion: PYTHON };
}

function exception(type: string): OracleRun {
    return { outcome: 'exception', exceptionType: type, runtimeVersion: PYTHON };
}

type FakeRunner = ((oracle: Oracle) => Promise<OracleRun>) & { calls: Oracle[] };

// Returns the same run for every call.
function fixedRunner(run: OracleRun): FakeRunner {
    return sequenceRunner([run, run, run, run, run, run]);
}

// Returns the given runs in call order; the last one repeats once exhausted.
function sequenceRunner(runs: OracleRun[]): FakeRunner {
    const calls: Oracle[] = [];
    const runner = async (oracle: Oracle): Promise<OracleRun> => {
        calls.push(oracle);
        const index = Math.min(calls.length - 1, runs.length - 1);
        return runs[index] as OracleRun;
    };
    return Object.assign(runner, { calls });
}

// Returns a run chosen by the executed code, so the main oracle and each
// choice snippet can report different output.
function codeRunner(byCode: Record<string, OracleRun>): FakeRunner {
    const calls: Oracle[] = [];
    const runner = async (oracle: Oracle): Promise<OracleRun> => {
        calls.push(oracle);
        const run = byCode[oracle.code];
        if (!run) {
            throw new Error(`fake runner has no output for code: ${oracle.code}`);
        }
        return run;
    };
    return Object.assign(runner, { calls });
}

describe('validateQuestion', () => {
    describe('no oracle', () => {
        it('returns not-executable and runs nothing', async () => {
            const run = fixedRunner(value('3'));

            const result = await validateQuestion(buildMc(['3', '4'], 0), null, run);

            expect(result).toStrictEqual<ValidationResult>({ status: 'not-executable' });
            expect(run.calls).toHaveLength(0);
        });
    });

    describe('three runs (B-10)', () => {
        it('runs the oracle exactly three times and passes on agreement', async () => {
            const run = fixedRunner(value('3'));
            const oracle = buildOracle();

            const result = await validateQuestion(buildMc(['3', '4'], 0), oracle, run);

            expect(result).toStrictEqual<ValidationResult>({
                status: 'passed',
                observed: '3',
                runtimeVersion: PYTHON,
            });
            expect(run.calls).toHaveLength(3);
            expect(run.calls.every((called) => called.code === oracle.code)).toBe(true);
        });

        it('rejects as nondeterministic when the third run prints a different value', async () => {
            const run = sequenceRunner([value('3'), value('3'), value('4')]);

            const result = await validateQuestion(buildMc(['3', '4'], 0), buildOracle(), run);

            expect(result).toMatchObject({ status: 'failed', reason: 'nondeterministic' });
        });

        it('rejects as nondeterministic when the second run differs from the first', async () => {
            const run = sequenceRunner([value('0.123'), value('0.456'), value('0.123')]);

            const result = await validateQuestion(buildMc(['0.123', '0.456'], 0), buildOracle(), run);

            expect(result).toMatchObject({ status: 'failed', reason: 'nondeterministic' });
        });

        it('rejects as nondeterministic when the outcome differs across runs', async () => {
            const run = sequenceRunner([value('3'), exception('TypeError'), value('3')]);

            const result = await validateQuestion(
                buildMc(['3', 'Raises a TypeError'], 0),
                buildOracle(),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'nondeterministic' });
        });

        it('rejects as nondeterministic when the exception type differs across runs', async () => {
            const run = sequenceRunner([
                exception('TypeError'),
                exception('TypeError'),
                exception('ValueError'),
            ]);

            const result = await validateQuestion(
                buildMc(['Raises a TypeError', 'Raises a ValueError'], 0),
                buildOracle(),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'nondeterministic' });
        });
    });

    describe('runner failures', () => {
        it.each(['timeout', 'resource-limit', 'sandbox-violation'])(
            'rejects as runner-error when every run reports %s',
            async (outcome) => {
                const failed = { outcome, runtimeVersion: PYTHON } as unknown as OracleRun;
                const run = fixedRunner(failed);

                const result = await validateQuestion(buildMc(['3', '4'], 0), buildOracle(), run);

                expect(result).toMatchObject({ status: 'failed', reason: 'runner-error' });
            },
        );

        it('rejects as runner-error when only one of the three runs times out', async () => {
            const run = sequenceRunner([
                value('3'),
                value('3'),
                { outcome: 'timeout', runtimeVersion: PYTHON },
            ]);

            const result = await validateQuestion(buildMc(['3', '4'], 0), buildOracle(), run);

            expect(result).toMatchObject({ status: 'failed', reason: 'runner-error' });
        });

        it('does not pass a timed-out oracle whose question claims a timeout answer', async () => {
            const run = fixedRunner({ outcome: 'timeout', runtimeVersion: PYTHON });

            const result = await validateQuestion(
                buildMc(['Runs forever', 'timeout', '3'], 1),
                buildOracle(),
                run,
            );

            expect(result.status).toBe('failed');
            expect(result.reason).toBe('runner-error');
        });
    });

    describe('mc and ab value matching (B-9, B-11)', () => {
        it('passes when the single matching choice is at answerIndex', async () => {
            const result = await validateQuestion(
                buildMc(['-4', '-3', '-3.9', 'Raises a TypeError'], 1),
                buildOracle(),
                fixedRunner(value('-3')),
            );

            expect(result).toStrictEqual<ValidationResult>({
                status: 'passed',
                observed: '-3',
                runtimeVersion: PYTHON,
            });
        });

        it('fails as answer-mismatch when the single matching choice is at another index', async () => {
            const result = await validateQuestion(
                buildMc(['-4', '-3', '-3.9', 'Raises a TypeError'], 0),
                buildOracle(),
                fixedRunner(value('-3')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('fails as answer-mismatch when no choice matches the observed value', async () => {
            const result = await validateQuestion(
                buildMc(['-4', '-3.9', 'Raises a TypeError'], 0),
                buildOracle(),
                fixedRunner(value('-3')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('fails as ambiguous when two choices match the observed value', async () => {
            const result = await validateQuestion(
                buildMc(['3', '4', ' 3 '], 0),
                buildOracle(),
                fixedRunner(value('3')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'ambiguous' });
        });

        it('fails as ambiguous even when one of the matches is at answerIndex', async () => {
            const result = await validateQuestion(
                buildMc(['3', '3', '4'], 0),
                buildOracle(),
                fixedRunner(value('3')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'ambiguous' });
        });

        it('trims the observed value and the choice text before comparing', async () => {
            const result = await validateQuestion(
                buildMc(['  [1, 2, 3]  ', '[3, 2, 1]'], 0),
                buildOracle(),
                fixedRunner(value('[1, 2, 3]\n')),
            );

            expect(result.status).toBe('passed');
        });

        it('does not treat a choice that only contains the observed value as a match', async () => {
            const result = await validateQuestion(
                buildMc(['13', '31', '4'], 0),
                buildOracle(),
                fixedRunner(value('3')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('passes an ab question whose answerIndex choice matches', async () => {
            const result = await validateQuestion(
                buildAb(['-Infinity', 'Infinity'], 0),
                buildOracle({ language: 'node', code: 'console.log(Math.max())' }),
                fixedRunner({ outcome: 'value', value: '-Infinity', runtimeVersion: 'Node v24.21.0' }),
            );

            expect(result).toStrictEqual<ValidationResult>({
                status: 'passed',
                observed: '-Infinity',
                runtimeVersion: 'Node v24.21.0',
            });
        });

        it('fails an ab question whose other choice matches as answer-mismatch', async () => {
            const result = await validateQuestion(
                buildAb(['-Infinity', 'Infinity'], 0),
                buildOracle({ language: 'node', code: 'console.log(Math.min())' }),
                fixedRunner({ outcome: 'value', value: 'Infinity', runtimeVersion: 'Node v24.21.0' }),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });
    });

    describe('exceptions and syntax errors as answers (B-12)', () => {
        it('passes when the answer choice names the raised exception type', async () => {
            const result = await validateQuestion(
                buildMc(['2', '11', 'Raises a TypeError', 'Raises a ValueError'], 2),
                buildOracle(),
                fixedRunner(exception('TypeError')),
            );

            expect(result).toMatchObject({ status: 'passed', runtimeVersion: PYTHON });
        });

        it('passes when the answer choice is exactly the exception type', async () => {
            const result = await validateQuestion(
                buildMc(['None', 'TypeError'], 1),
                buildOracle(),
                fixedRunner(exception('TypeError')),
            );

            expect(result.status).toBe('passed');
        });

        it('fails as answer-mismatch when the answer choice names a different exception', async () => {
            const result = await validateQuestion(
                buildMc(['2', '11', 'Raises a TypeError', 'Raises a ValueError'], 3),
                buildOracle(),
                fixedRunner(exception('TypeError')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('matches the exception type as a whole word only', async () => {
            const result = await validateQuestion(
                buildMc(['Raises a TypeError', '0'], 0),
                buildOracle({ language: 'node' }),
                fixedRunner({ outcome: 'exception', exceptionType: 'Error', runtimeVersion: 'Node v24.21.0' }),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('fails as ambiguous when two choices name the raised exception type', async () => {
            const result = await validateQuestion(
                buildMc(['Raises a TypeError', 'TypeError at runtime', '0'], 0),
                buildOracle(),
                fixedRunner(exception('TypeError')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'ambiguous' });
        });

        it('fails as answer-mismatch when the oracle raises and every choice is a plain value', async () => {
            const result = await validateQuestion(
                buildMc(['2', '11'], 0),
                buildOracle(),
                fixedRunner(exception('TypeError')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('passes a syntax-error outcome against the choice naming SyntaxError', async () => {
            const result = await validateQuestion(
                buildMc(['None', 'Raises a SyntaxError', '0'], 1),
                buildOracle(),
                fixedRunner({ outcome: 'syntax-error', runtimeVersion: PYTHON }),
            );

            expect(result.status).toBe('passed');
        });

        it('fails a syntax-error outcome as answer-mismatch when no choice names SyntaxError', async () => {
            const result = await validateQuestion(
                buildMc(['None', 'Raises a TypeError', '0'], 1),
                buildOracle(),
                fixedRunner({ outcome: 'syntax-error', runtimeVersion: PYTHON }),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });
    });

    describe('per-choice code (oracle.choiceCode)', () => {
        const MAIN = 'print(sorted([3, 1, 2]))';

        it('passes when only the answer choice snippet reproduces the oracle output', async () => {
            const run = codeRunner({
                [MAIN]: value('[1, 2, 3]'),
                'print([1, 2, 3])': value('[1, 2, 3]'),
                'print([3, 2, 1])': value('[3, 2, 1]'),
            });

            const result = await validateQuestion(
                buildAb(['Ascending', 'Descending'], 0),
                buildOracle({ code: MAIN, choiceCode: ['print([1, 2, 3])', 'print([3, 2, 1])'] }),
                run,
            );

            expect(result).toMatchObject({ status: 'passed', observed: '[1, 2, 3]', runtimeVersion: PYTHON });
            expect(run.calls.filter((called) => called.code === MAIN)).toHaveLength(3);
            expect(run.calls.some((called) => called.code === 'print([3, 2, 1])')).toBe(true);
        });

        it('fails as answer-mismatch when another choice snippet reproduces the output', async () => {
            const run = codeRunner({
                [MAIN]: value('[1, 2, 3]'),
                'print([1, 2, 3])': value('[1, 2, 3]'),
                'print([3, 2, 1])': value('[3, 2, 1]'),
            });

            const result = await validateQuestion(
                buildAb(['Ascending', 'Descending'], 1),
                buildOracle({ code: MAIN, choiceCode: ['print([1, 2, 3])', 'print([3, 2, 1])'] }),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('fails as ambiguous when two choice snippets reproduce the output', async () => {
            const run = codeRunner({
                [MAIN]: value('[1, 2, 3]'),
                'print([1, 2, 3])': value('[1, 2, 3]'),
                'print(list(range(1, 4)))': value('[1, 2, 3]'),
                'print([3, 2, 1])': value('[3, 2, 1]'),
            });

            const result = await validateQuestion(
                buildMc(['Literal', 'Range', 'Reversed'], 0),
                buildOracle({
                    code: MAIN,
                    choiceCode: ['print([1, 2, 3])', 'print(list(range(1, 4)))', 'print([3, 2, 1])'],
                }),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'ambiguous' });
        });

        it('fails as answer-mismatch when no choice snippet reproduces the output', async () => {
            const run = codeRunner({
                [MAIN]: value('[1, 2, 3]'),
                'print([2, 1, 3])': value('[2, 1, 3]'),
                'print([3, 2, 1])': value('[3, 2, 1]'),
            });

            const result = await validateQuestion(
                buildAb(['Shuffled', 'Descending'], 0),
                buildOracle({ code: MAIN, choiceCode: ['print([2, 1, 3])', 'print([3, 2, 1])'] }),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('compares snippet output, not choice text', async () => {
            const run = codeRunner({
                [MAIN]: value('[1, 2, 3]'),
                'print([3, 2, 1])': value('[3, 2, 1]'),
                'print([1, 2, 3])': value('[1, 2, 3]'),
            });

            // Choice 0's text equals the oracle output but its snippet does not.
            const result = await validateQuestion(
                buildAb(['[1, 2, 3]', 'Other'], 0),
                buildOracle({ code: MAIN, choiceCode: ['print([3, 2, 1])', 'print([1, 2, 3])'] }),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('runs each choice snippet three times', async () => {
            const run = codeRunner({
                [MAIN]: value('[1, 2, 3]'),
                'print([1, 2, 3])': value('[1, 2, 3]'),
                'print([3, 2, 1])': value('[3, 2, 1]'),
            });

            await validateQuestion(
                buildAb(['Ascending', 'Descending'], 0),
                buildOracle({ code: MAIN, choiceCode: ['print([1, 2, 3])', 'print([3, 2, 1])'] }),
                run,
            );

            expect(run.calls.filter((called) => called.code === 'print([3, 2, 1])')).toHaveLength(3);
        });

        it('fails as nondeterministic when a choice snippet changes between runs', async () => {
            const seen: Record<string, number> = {};
            const run = async (oracle: Oracle): Promise<OracleRun> => {
                seen[oracle.code] = (seen[oracle.code] ?? 0) + 1;
                if (oracle.code === 'print(random())') {
                    return value(seen[oracle.code] === 1 ? '[1, 2, 3]' : '[3, 2, 1]');
                }
                return value('[1, 2, 3]');
            };

            const result = await validateQuestion(
                buildAb(['Ascending', 'Random'], 0),
                buildOracle({ code: MAIN, choiceCode: ['print([1, 2, 3])', 'print(random())'] }),
                run,
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'nondeterministic' });
        });

        it.each([
            ['fewer snippets than choices', ['print([1, 2, 3])']],
            ['more snippets than choices', ['print([1, 2, 3])', 'print([3, 2, 1])', 'print(0)']],
        ])('fails as answer-mismatch with %s', async (_label, choiceCode) => {
            const result = await validateQuestion(
                buildAb(['Ascending', 'Descending'], 0),
                buildOracle({ code: MAIN, choiceCode }),
                fixedRunner(value('[1, 2, 3]')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('runs each choice snippet in the oracle language with its setup SQL', async () => {
            const setupSql = 'CREATE TABLE t (x int); INSERT INTO t VALUES (1), (NULL), (3);';
            const run = codeRunner({
                'SELECT count(x) FROM t': { outcome: 'value', value: '2', runtimeVersion: 'PostgreSQL 17.11' },
                'SELECT count(*) FROM t': { outcome: 'value', value: '3', runtimeVersion: 'PostgreSQL 17.11' },
                'SELECT 2': { outcome: 'value', value: '2', runtimeVersion: 'PostgreSQL 17.11' },
            });

            const result = await validateQuestion(
                buildAb(['count(*)', 'literal 2'], 1),
                {
                    language: 'postgres',
                    code: 'SELECT count(x) FROM t',
                    setupSql,
                    choiceCode: ['SELECT count(*) FROM t', 'SELECT 2'],
                },
                run,
            );

            expect(result.status).toBe('passed');
            const snippetCalls = run.calls.filter((called) => called.code !== 'SELECT count(x) FROM t');
            expect(snippetCalls.length).toBeGreaterThan(0);
            for (const called of snippetCalls) {
                expect(called.language).toBe('postgres');
                expect(called.setupSql).toBe(setupSql);
            }
        });
    });

    describe('bool questions', () => {
        it.each([
            ['True', true],
            ['true', true],
            ['False', false],
            ['false', false],
        ])('passes when the observed %s equals the answer %s', async (observed, answer) => {
            const result = await validateQuestion(buildBool(answer), buildOracle(), fixedRunner(value(observed)));

            expect(result).toMatchObject({ status: 'passed', observed, runtimeVersion: PYTHON });
        });

        it.each([
            ['True', false],
            ['false', true],
        ])('fails as answer-mismatch when the observed %s contradicts the answer %s', async (observed, answer) => {
            const result = await validateQuestion(buildBool(answer), buildOracle(), fixedRunner(value(observed)));

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it.each(['yes', '1', 't', 'TRUE!', ''])(
            'fails as answer-mismatch when the observed value %j is not a boolean',
            async (observed) => {
                const result = await validateQuestion(buildBool(true), buildOracle(), fixedRunner(value(observed)));

                expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
            },
        );

        it('fails as answer-mismatch when the oracle raises', async () => {
            const result = await validateQuestion(
                buildBool(true),
                buildOracle(),
                fixedRunner(exception('TypeError')),
            );

            expect(result).toMatchObject({ status: 'failed', reason: 'answer-mismatch' });
        });

        it('still requires three agreeing runs', async () => {
            const run = sequenceRunner([value('True'), value('False'), value('True')]);

            const result = await validateQuestion(buildBool(true), buildOracle(), run);

            expect(result).toMatchObject({ status: 'failed', reason: 'nondeterministic' });
        });
    });
});
