// Topic-track generation with a judge configured: a not-executable draft goes to the judged route
// (source check, blind answers, consistency) instead of being dropped, and never reaches the
// sandbox. Fake providers, fake source fetcher, fake runner: no Docker, no network, no model.
import { describe, expect, it } from 'vitest';

import { generateTopicQuestion } from '../../services/gapFill/generateTopicQuestion.js';
import { normalizePrompt } from '../../services/gapFill/normalizePrompt.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';

const SOURCE = {
    quote: 'Lax cookies are not sent on cross-site POST requests',
    title: 'Using HTTP cookies',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};
const NOT_EXECUTABLE = {
    notExecutable: {
        question: {
            answer: true,
            grammar: 'plain',
            prompt: 'SameSite=Lax withholds the session cookie on a cross-site form POST.',
            query: { explanation: 'Lax sends cookies on top-level GET navigations only.', title: 'SameSite=Lax' },
            rationale: 'Lax still sends the cookie on top-level GET, which is why some think it blocks nothing.',
            sources: [SOURCE],
            type: 'bool',
        },
        reason: 'Cookie policy is enforced by the browser.',
    },
};

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

function recordingRun() {
    const calls: Oracle[] = [];
    return {
        calls,
        run: async (oracle: Oracle): Promise<OracleRun> => {
            calls.push(oracle);
            return { outcome: 'value', value: 'x' };
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
        runners: ['python', 'node', 'postgres'] as const,
        topic: 'sql-injection',
    };
}

function judgeWith(claudeAnswer: number, codexAnswer: number, page = `<p>${SOURCE.quote}</p>`) {
    const fetched: string[] = [];
    const modelCalls: string[] = [];
    const answer = (index: number) =>
        ({
            async generate(request) {
                modelCalls.push(request.prompt);
                const reply = request.prompt.includes('<quotes>')
                    ? { isConsistent: true, reason: 'Supported.' }
                    : { answerIndex: index };
                return { model: 'fake', value: request.schema.parse(reply) };
            },
        }) as ModelProvider;
    const fetchSource = async (url: string) => {
        fetched.push(url);
        return { contentType: 'text/html', finalUrl: url, ok: true as const, text: page };
    };
    return { claude: answer(claudeAnswer), codex: answer(codexAnswer), fetchSource, fetched, modelCalls };
}

describe('generateTopicQuestion with a judge', () => {
    it('keeps a not-executable draft as judged and passed with its evidence', async () => {
        const { calls, run } = recordingRun();
        const outcome = await generateTopicQuestion({
            ...baseArgs(scripted([NOT_EXECUTABLE]), run),
            judge: judgeWith(0, 0),
        });
        expect(outcome.status).toBe('kept');
        if (outcome.status !== 'kept') return;
        expect(outcome.question.grammar).toBe('plain');
        expect(outcome.question.provenance.validation).toEqual({
            evidence: { sources: [SOURCE], verdict: 'Supported.' },
            method: 'judged',
            status: 'passed',
        });
        expect(calls).toEqual([]);
    });

    it('returns a disputed card when the blind answers disagree', async () => {
        const outcome = await generateTopicQuestion({
            ...baseArgs(scripted([NOT_EXECUTABLE]), recordingRun().run),
            judge: judgeWith(0, 1),
        });
        expect(outcome).toMatchObject({
            card: { blindAnswers: { claude: 0, codex: 1 }, claimedIndex: 0 },
            status: 'disputed',
        });
    });

    it('drops a draft whose quote is not on the page, with no blind-answer or judge call', async () => {
        const judge = judgeWith(0, 0, '<p>unrelated</p>');
        const outcome = await generateTopicQuestion({
            ...baseArgs(scripted([NOT_EXECUTABLE]), recordingRun().run),
            judge,
        });
        expect(outcome).toEqual({ reason: 'source-unverified', status: 'dropped' });
        expect(judge.fetched).toHaveLength(1);
        expect(judge.modelCalls).toEqual([]);
    });

    it('sends back a not-executable draft without a rationale before judging', async () => {
        const { rationale: _omitted, ...withoutRationale } = NOT_EXECUTABLE.notExecutable.question;
        const incomplete = { notExecutable: { ...NOT_EXECUTABLE.notExecutable, question: withoutRationale } };
        const provider = scripted([incomplete, NOT_EXECUTABLE]);
        const judge = judgeWith(0, 0);
        const outcome = await generateTopicQuestion({
            ...baseArgs(provider, recordingRun().run),
            judge,
        });
        expect(outcome.status).toBe('kept');
        expect(provider.prompts[1]).toContain('every wrong choice needs a rationale of at most 280 characters');
        expect(judge.fetched).toHaveLength(1);
    });

    it('drops a not-executable duplicate without judging', async () => {
        const judge = judgeWith(0, 0);
        const outcome = await generateTopicQuestion({
            ...baseArgs(scripted([NOT_EXECUTABLE]), recordingRun().run),
            existingPrompts: new Set([normalizePrompt(NOT_EXECUTABLE.notExecutable.question.prompt)]),
            judge,
        });
        expect(outcome).toEqual({ reason: 'duplicate', status: 'dropped' });
        expect(judge.fetched).toEqual([]);
        expect(judge.modelCalls).toEqual([]);
    });

    it('still drops a not-executable draft when no judge is configured', async () => {
        const outcome = await generateTopicQuestion(baseArgs(scripted([NOT_EXECUTABLE]), recordingRun().run));
        expect(outcome).toEqual({ reason: 'not-executable', status: 'dropped' });
    });
});
