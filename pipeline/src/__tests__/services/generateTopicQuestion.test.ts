// Topic-track generation: the model picks a runner per question from the track's list; the card
// takes that runner's grammar; a runner outside the list drops the draft. Fake provider and fake
// runOracle, so no Docker and no real model run.
import { describe, expect, it } from 'vitest';

import { generateTopicQuestion } from '../../services/gapFill/generateTopicQuestion.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';
import { ProviderTransientError } from '../../types/ProviderTransientError.js';

const RUNNERS = ['python', 'node', 'postgres'] as const;
const QUERY = { explanation: 'Formatting splices the payload into SQL.', title: 'Tautology injection' };

function mcDraft(overrides: Record<string, unknown> = {}): { question: Record<string, unknown> } {
    return {
        question: {
            answerIndex: 1,
            choices: [
                {
                    rationale: 'The payload rewrites the WHERE clause, so the filter no longer holds.',
                    text: 'Only alice',
                },
                { text: 'alice and bob' },
                { rationale: 'The quotes in the payload balance, so the SQL still parses.', text: 'A syntax error' },
            ],
            code: 'query = f"SELECT name FROM users WHERE name = \'{name}\'"',
            oracle: { code: 'print("alice and bob")', language: 'python' },
            prompt: "With name = x' OR '1'='1, which rows does the query return?",
            query: QUERY,
            type: 'mc',
            ...overrides,
        },
    };
}

function scripted(replies: unknown[]): ModelProvider & { prompts: string[] } {
    const prompts: string[] = [];
    return {
        async generate(request) {
            const reply = replies[Math.min(prompts.length, replies.length - 1)];
            prompts.push(request.prompt);
            const parsed = request.schema.safeParse(reply);
            if (!parsed.success) {
                throw new ModelOutputInvalid(request.promptVersion, 'bad');
            }
            return { model: 'fake-model', value: parsed.data };
        },
        prompts,
    } as ModelProvider & { prompts: string[] };
}

function recordingRun(
    decide: (oracle: Oracle) => OracleRun = () => ({
        outcome: 'value',
        runtimeVersion: 'Python 3.13.1',
        value: 'alice and bob',
    }),
) {
    const calls: Oracle[] = [];
    return {
        calls,
        run: async (oracle: Oracle) => {
            calls.push(oracle);
            return decide(oracle);
        },
    };
}

function baseArgs(provider: ModelProvider, run: (oracle: Oracle) => Promise<OracleRun>) {
    return {
        difficulty: 'easy',
        existingPrompts: new Set<string>(),
        languageId: 'backend-security',
        provider,
        run,
        runners: RUNNERS,
        topic: 'sql-injection',
    };
}

function pickTheFix(choiceCode: string[], answerIndex: number): { question: Record<string, unknown> } {
    return mcDraft({
        answerIndex,
        choices: [
            {
                rationale: 'Escaping quotes by hand misses backslashes and encodings.',
                text: 'name.replace("\'", "\'\'")',
            },
            { text: 'cursor.execute(sql, params)' },
        ],
        oracle: { choiceCode, code: 'print("BLOCKED")', language: 'python' },
    });
}

// The marker is printed by a program that contains the word BLOCKED, so the fake runner can tell fixes apart.
function markerRun() {
    return recordingRun((oracle) => ({
        outcome: 'value',
        value: oracle.code.includes('BLOCKED') ? 'BLOCKED' : 'LEAKED',
    }));
}

describe('generateTopicQuestion', () => {
    it('drops a question on a transient provider failure instead of throwing', async () => {
        const provider: ModelProvider = {
            async generate() {
                throw new ProviderTransientError('model-timeout', 'claude timed out after 300000 ms');
            },
        };
        await expect(generateTopicQuestion(baseArgs(provider, recordingRun().run))).resolves.toEqual({
            reason: 'model-timeout',
            status: 'dropped',
        });
    });

    it('propagates a provider error that is not transient', async () => {
        const failure = new Error('claude could not start');
        const provider: ModelProvider = {
            async generate() {
                throw failure;
            },
        };
        await expect(generateTopicQuestion(baseArgs(provider, recordingRun().run))).rejects.toBe(failure);
    });

    it('keeps a python-executed draft with the python grammar and an executed, passed provenance', async () => {
        const { calls, run } = recordingRun();
        const outcome = await generateTopicQuestion(baseArgs(scripted([mcDraft()]), run));
        expect(outcome.status).toBe('kept');
        if (outcome.status !== 'kept') {
            return;
        }
        expect(outcome.question.grammar).toBe('python');
        expect(outcome.question.id).toMatch(/^gen-backend-security-easy-[0-9a-f]{8}$/);
        expect(outcome.question.topic).toBe('sql-injection');
        expect(outcome.question.provenance).toMatchObject({
            promptVersion: 'generate-security-question-v1',
            runtimeVersion: 'Python 3.13.1',
            validation: { method: 'executed', status: 'passed' },
        });
        expect(calls.every((oracle) => oracle.language === 'python')).toBe(true);
    });

    it('gives a postgres-executed draft the sql grammar and passes setupSql to the runner', async () => {
        const { calls, run } = recordingRun();
        const draft = mcDraft({
            oracle: {
                code: "SELECT 'alice and bob';",
                language: 'postgres',
                setupSql: 'CREATE TABLE users (name text);',
            },
        });
        const outcome = await generateTopicQuestion(baseArgs(scripted([draft]), run));
        expect(outcome.status === 'kept' && outcome.question.grammar).toBe('sql');
        expect(calls[0]).toEqual({
            code: "SELECT 'alice and bob';",
            language: 'postgres',
            setupSql: 'CREATE TABLE users (name text);',
        });
    });

    it('gives a node-executed draft the javascript grammar', async () => {
        const { run } = recordingRun();
        const outcome = await generateTopicQuestion(
            baseArgs(scripted([mcDraft({ oracle: { code: "console.log('alice and bob')", language: 'node' } })]), run),
        );
        expect(outcome.status === 'kept' && outcome.question.grammar).toBe('javascript');
    });

    it.each(['ruby', 'jsdom', 'bash'])(
        'drops a draft whose oracle uses %s, outside the track, without running it',
        async (language) => {
            const { calls, run } = recordingRun();
            const provider = scripted([mcDraft({ oracle: { code: 'x', language } })]);
            expect(await generateTopicQuestion(baseArgs(provider, run))).toEqual({
                reason: 'disallowed-runner',
                status: 'dropped',
            });
            expect(calls).toEqual([]);
            expect(provider.prompts).toHaveLength(1);
        },
    );

    it('refuses an execute request on a runner outside the track and says which runners are allowed', async () => {
        const { calls, run } = recordingRun();
        const provider = scripted([{ execute: { code: 'puts 1', language: 'ruby' } }, mcDraft()]);
        const outcome = await generateTopicQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        expect(calls.some((oracle) => (oracle.language as string) === 'ruby')).toBe(false);
        expect(provider.prompts[1]).toContain('execute must use one of: python, node, postgres');
    });

    it('runs an execute request on an allowed runner and feeds the observation back', async () => {
        const { calls, run } = recordingRun();
        const provider = scripted([{ execute: { code: 'print(1)', language: 'node' } }, mcDraft()]);
        const outcome = await generateTopicQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        expect(calls[0]).toEqual({ code: 'print(1)', language: 'node' });
        expect(provider.prompts[1]).toContain('executed program, observed');
    });

    it('drops a not-executable draft as not-executable when no judge is configured, without running anything', async () => {
        const { calls, run } = recordingRun();
        const notExecutable = {
            notExecutable: {
                question: {
                    answer: true,
                    prompt: 'SameSite=Lax withholds the cookie on a cross-site POST.',
                    query: QUERY,
                    rationale: 'Lax sends cookies on top-level GET only.',
                    sources: [{ quote: 'q'.repeat(25), title: 'Cookies', url: 'https://developer.mozilla.org/x' }],
                    type: 'bool',
                },
                reason: 'Needs a browser.',
            },
        };
        expect(await generateTopicQuestion(baseArgs(scripted([notExecutable]), run))).toEqual({
            reason: 'not-executable',
            status: 'dropped',
        });
        expect(calls).toEqual([]);
    });

    it('sends back an mc draft missing a wrong-choice rationale, then keeps the fixed draft', async () => {
        const { run } = recordingRun();
        const missing = mcDraft({
            choices: [{ text: 'Only alice' }, { text: 'alice and bob' }, { text: 'A syntax error' }],
        });
        const provider = scripted([missing, mcDraft()]);
        const outcome = await generateTopicQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        expect(provider.prompts[1]).toContain('every wrong choice needs a rationale of at most 280 characters');
    });

    it('never runs an mc draft that lacks a wrong-choice rationale, and drops it when it stays that way', async () => {
        const { calls, run } = recordingRun();
        const missing = mcDraft({
            choices: [{ text: 'Only alice' }, { text: 'alice and bob' }, { text: 'A syntax error' }],
        });
        expect(await generateTopicQuestion(baseArgs(scripted([missing]), run))).toEqual({
            reason: 'generation-failed',
            status: 'dropped',
        });
        expect(calls).toEqual([]);
    });

    it('never runs an mc draft whose wrong-choice rationale is over 280 characters', async () => {
        const { calls, run } = recordingRun();
        const tooLong = mcDraft({
            choices: [{ rationale: 'x'.repeat(281), text: 'Only alice' }, { text: 'alice and bob' }],
        });
        const outcome = await generateTopicQuestion(baseArgs(scripted([tooLong]), run));
        expect(outcome).toEqual({ reason: 'generation-failed', status: 'dropped' });
        expect(calls).toEqual([]);
    });

    it('never runs a bool draft without a rationale', async () => {
        const { calls, run } = recordingRun(() => ({ outcome: 'value', value: 'True' }));
        const draft = {
            question: {
                answer: true,
                oracle: { code: 'print(True)', language: 'python' },
                prompt: 'Does ../ escape the base directory here?',
                query: QUERY,
                type: 'bool',
            },
        };
        expect(await generateTopicQuestion(baseArgs(scripted([draft]), run))).toEqual({
            reason: 'generation-failed',
            status: 'dropped',
        });
        expect(calls).toEqual([]);
    });

    it('keeps a pick-the-fix draft where only the correct fix prints the blocked marker', async () => {
        const { run } = markerRun();
        const draft = pickTheFix(['print("LEAK" + "ED")', 'run(sql, params); print("BLOCKED")'], 1);
        const outcome = await generateTopicQuestion(baseArgs(scripted([draft]), run));
        expect(outcome.status).toBe('kept');
    });

    it('fails generation when two fixes print the blocked marker on every draft', async () => {
        const { run } = markerRun();
        const draft = pickTheFix(['a(); print("BLOCKED")', 'b(); print("BLOCKED")'], 1);
        expect(await generateTopicQuestion(baseArgs(scripted([draft]), run))).toEqual({
            reason: 'generation-failed',
            status: 'dropped',
        });
    });

    it('fails generation when only a wrong fix prints the blocked marker', async () => {
        const { run } = markerRun();
        const draft = pickTheFix(['a(); print("BLOCKED")', 'print("LEAK" + "ED")'], 1);
        expect(await generateTopicQuestion(baseArgs(scripted([draft]), run))).toEqual({
            reason: 'generation-failed',
            status: 'dropped',
        });
    });

    it('keeps a bool draft that carries its rationale', async () => {
        const { run } = recordingRun(() => ({ outcome: 'value', value: 'True' }));
        const draft = {
            question: {
                answer: true,
                oracle: { code: 'print(True)', language: 'python' },
                prompt: 'Does ../ escape the base directory here?',
                query: QUERY,
                rationale: 'normpath resolves ../ before the prefix check runs.',
                type: 'bool',
            },
        };
        const outcome = await generateTopicQuestion(baseArgs(scripted([draft]), run));
        expect(outcome.status === 'kept' && outcome.question).toMatchObject({
            answer: true,
            rationale: 'normpath resolves ../ before the prefix check runs.',
            type: 'bool',
        });
    });
});
