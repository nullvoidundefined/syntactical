// Task 2.3: execution-checked question generation. A fake provider scripts the model and a
// fake runOracle stands in for the Docker sandbox; no Docker and no real model run here.
import { validateQuestionBank } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { GENERATE_RUN_LIMITS } from '../../services/gapFill/GENERATE_RUN_LIMITS.js';
import { MAX_REVISIONS } from '../../services/gapFill/MAX_REVISIONS.js';
import { generateQuestion } from '../../services/gapFill/generateQuestion.js';
import { normalizePrompt } from '../../services/gapFill/normalizePrompt.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';
import type { RunLimits } from '../../types/RunLimits.js';

const TOPIC = 'strings';
const RUNTIME = '3.12.1';
const MODEL = 'fake-model';

interface RunCall {
    limits: RunLimits | undefined;
    oracle: Oracle;
}

function buildDraft(overrides: Record<string, unknown> = {}): { question: Record<string, unknown> } {
    return {
        question: {
            answerIndex: 1,
            choices: [{ text: '2' }, { text: '3' }, { text: '4' }],
            code: 'len("abc")',
            oracle: { code: 'print(len("abc"))' },
            prompt: 'What does len of abc return?',
            query: { explanation: 'len counts characters.', title: 'len counts characters' },
            type: 'mc',
            ...overrides,
        },
    };
}

function scripted(next: (call: number, prompt: string) => unknown): ModelProvider & { prompts: string[] } {
    const prompts: string[] = [];
    return {
        async generate(request) {
            const reply = next(prompts.length, request.prompt);
            prompts.push(request.prompt);
            const parsed = request.schema.safeParse(reply);
            if (!parsed.success) {
                throw new ModelOutputInvalid(request.promptVersion, 'bad');
            }
            return { model: MODEL, value: parsed.data };
        },
        prompts,
    } as ModelProvider & { prompts: string[] };
}

function fakeRun(result: OracleRun = { outcome: 'value', runtimeVersion: RUNTIME, value: '3' }): {
    calls: RunCall[];
    run: (oracle: Oracle, limits?: RunLimits) => Promise<OracleRun>;
} {
    const calls: RunCall[] = [];
    return {
        calls,
        async run(oracle, limits) {
            calls.push({ limits, oracle });
            return result;
        },
    };
}

function baseArgs(provider: ModelProvider, run: ReturnType<typeof fakeRun>['run'], existing: string[] = []) {
    return {
        difficulty: 'easy',
        existingPrompts: new Set(existing.map(normalizePrompt)),
        language: 'python' as const,
        languageId: 'python',
        provider,
        run,
        topic: TOPIC,
    };
}

describe('generateQuestion', () => {
    it('keeps a question whose claimed answer matches the executed oracle, with full provenance', async () => {
        const provider = scripted(() => buildDraft());
        const { run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        if (outcome.status !== 'kept') {
            return;
        }
        const { question } = outcome;
        expect(question.provenance).toEqual({
            isHumanReviewed: false,
            model: MODEL,
            promptVersion: 'generate-question-v1',
            runtimeVersion: RUNTIME,
            source: 'generated',
            validation: { method: 'executed', status: 'passed' },
        });
        expect(question.topic).toBe(TOPIC);
        const checked = validateQuestionBank({ questions: [question], schemaVersion: 2 }, {
            misconceptionIds: [],
            topicIds: [TOPIC],
        });
        expect(checked).toMatchObject({ isValid: true });
    });

    it('revises after an answer mismatch, feeding the failure back, then keeps the corrected draft', async () => {
        const provider = scripted((call) => (call === 0 ? buildDraft({ answerIndex: 0 }) : buildDraft()));
        const { run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        expect(provider.prompts).toHaveLength(2);
        expect(provider.prompts[0]).not.toContain('answer-mismatch');
        expect(provider.prompts[1]).toContain('answer-mismatch');
    });

    it('drops a question as generation-failed after MAX_REVISIONS failed drafts', async () => {
        const provider = scripted(() => buildDraft({ answerIndex: 0 }));
        const { run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome).toEqual({ reason: 'generation-failed', status: 'dropped' });
        expect(MAX_REVISIONS).toBe(3);
        expect(provider.prompts).toHaveLength(MAX_REVISIONS);
    });

    it('counts schema-invalid model output as a failed revision, not a crash', async () => {
        const provider = scripted(() => ({ nonsense: true }));
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome).toEqual({ reason: 'generation-failed', status: 'dropped' });
        expect(provider.prompts).toHaveLength(MAX_REVISIONS);
        expect(calls).toHaveLength(0);
    });

    it('runs an execute request only through runOracle with the language, code, setupSql and fixed limits', async () => {
        const provider = scripted((call) =>
            call === 0 ? { execute: { code: 'print(len("abc"))', language: 'python' } } : buildDraft(),
        );
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        expect(calls.length).toBeGreaterThan(1);
        for (const { limits, oracle } of calls) {
            expect(Object.keys(oracle).sort()).toEqual(['code', 'language'].sort());
            expect(limits).toEqual(GENERATE_RUN_LIMITS);
        }
        expect(calls[0]?.oracle).toEqual({ code: 'print(len("abc"))', language: 'python' });
        // The observation reaches the next draft prompt.
        expect(provider.prompts[1]).toContain(String.raw`\"value\":\"3\"`);
    });

    it('forwards setupSql and strips choiceCode before anything reaches runOracle', async () => {
        const draft = buildDraft({ oracle: { choiceCode: ['print(1)', 'print(2)', 'print(3)'], code: 'print(3)', setupSql: 'select 1' } });
        const { calls, run } = fakeRun();
        await generateQuestion(baseArgs(scripted(() => draft), run));
        expect(calls.length).toBeGreaterThan(0);
        for (const { oracle } of calls) {
            expect(Object.keys(oracle).sort()).toEqual(['code', 'language', 'setupSql']);
            expect(oracle).not.toHaveProperty('choiceCode');
        }
        const codes = calls.map(({ oracle }) => oracle.code);
        for (const snippet of ['print(1)', 'print(2)', 'print(3)']) {
            expect(codes).toContain(snippet);
        }
    });

    it('rejects an execute request that tries to set docker flags, an image, or limits, without running it', async () => {
        const hostile = { execute: { code: 'print(1)', dockerFlags: '--privileged', image: 'evil', language: 'python', timeoutMs: 999999 } };
        const provider = scripted(() => hostile);
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome).toEqual({ reason: 'generation-failed', status: 'dropped' });
        expect(calls).toHaveLength(0);
    });

    it('refuses an execute request in another language than the bank without running it', async () => {
        const provider = scripted(() => ({ execute: { code: 'console.log(1)', language: 'node' } }));
        const { calls, run } = fakeRun();
        await generateQuestion(baseArgs(provider, run));
        expect(calls).toHaveLength(0);
    });

    it('screens execute code with findRefusedConstruct: refused code never runs and costs a revision', async () => {
        const provider = scripted((call) =>
            call === 0 ? { execute: { code: 'import subprocess\nprint(1)', language: 'python' } } : buildDraft(),
        );
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome.status).toBe('kept');
        expect(provider.prompts).toHaveLength(2);
        expect(provider.prompts[1]).toContain('refused: subprocess');
        expect(calls.every(({ oracle }) => !oracle.code.includes('subprocess'))).toBe(true);
    });

    it('screens the answer oracle too: a refused oracle never runs', async () => {
        const provider = scripted(() => buildDraft({ oracle: { code: 'import subprocess\nprint(3)' } }));
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome).toEqual({ reason: 'generation-failed', status: 'dropped' });
        expect(calls).toHaveLength(0);
    });

    it('bounds execute requests per draft so a model cannot loop forever', async () => {
        const provider = scripted(() => ({ execute: { code: 'print(1)', language: 'python' } }));
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run));
        expect(outcome).toEqual({ reason: 'generation-failed', status: 'dropped' });
        expect(calls.length).toBeLessThanOrEqual(MAX_REVISIONS * MAX_REVISIONS);
        expect(provider.prompts.length).toBeLessThanOrEqual(MAX_REVISIONS * (MAX_REVISIONS + 1));
    });

    it('drops a draft whose normalized prompt equals an existing one as duplicate, before running anything', async () => {
        const provider = scripted(() => buildDraft());
        const { calls, run } = fakeRun();
        const outcome = await generateQuestion(baseArgs(provider, run, ['  WHAT does len of ABC return??']));
        expect(outcome).toEqual({ reason: 'duplicate', status: 'dropped' });
        expect(calls).toHaveLength(0);
    });

    it('keeps a bool question when its answer matches the executed output', async () => {
        const draft = {
            question: {
                answer: true,
                oracle: { code: 'print("abc".isalpha())' },
                prompt: 'Is abc alphabetic?',
                query: { explanation: 'isalpha checks letters.', title: 'isalpha' },
                type: 'bool',
            },
        };
        const outcome = await generateQuestion(baseArgs(scripted(() => draft), fakeRun({ outcome: 'value', runtimeVersion: RUNTIME, value: 'True' }).run));
        expect(outcome.status).toBe('kept');
    });
});
