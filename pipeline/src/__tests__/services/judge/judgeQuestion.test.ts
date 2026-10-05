// The judged route: a verified source, two blind answers equal to the claim, and a consistent
// explanation make a judged/passed card; a source failure drops it with no model call; any other
// failure makes a disputed card; a broken Codex CLI stops the run.
import { type Question, validateQuestionBank } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import type { SourceFetcher } from '../../../clients/sourceFetcher.js';
import { judgeQuestion } from '../../../services/judge/judgeQuestion.js';
import { ModelOutputInvalid } from '../../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

const SOURCE = {
    quote: 'Lax cookies are not sent on cross-site POST requests',
    title: 'Using HTTP cookies',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};
const EXPLANATION =
    'SameSite=Lax withholds the cookie on cross-site POST, so the forged form arrives without a session.';
const RATIONALE = 'Strict is the setting that also withholds it on top-level GET navigations.';

const MC = {
    answerIndex: 1,
    choices: [
        { rationale: RATIONALE, text: 'Every cross-site request' },
        { text: 'Cross-site POST, not top-level GET' },
        { rationale: RATIONALE, text: 'Nothing' },
    ],
    grammar: 'plain',
    id: 'gen-backend-security-easy-0a1b2c3d',
    prompt: 'What does SameSite=Lax block?',
    provenance: {
        isHumanReviewed: false,
        model: 'm',
        source: 'generated',
        validation: { method: 'judged', status: 'pending' },
    },
    query: { explanation: EXPLANATION, title: 'SameSite=Lax' },
    topic: 'sessions',
    type: 'mc',
} as Question;

const pageWithQuote: SourceFetcher = async (url) => ({
    contentType: 'text/html',
    finalUrl: url,
    ok: true,
    text: `<p>${SOURCE.quote}.</p>`,
});

function fakeModel(
    blind: number | 'invalid',
    consistency: { isConsistent: boolean; reason: string } | 'invalid' = {
        isConsistent: true,
        reason: 'The quote supports the claim.',
    },
) {
    const prompts: string[] = [];
    const provider = {
        async generate(request) {
            prompts.push(request.prompt);
            const isConsistencyPass = request.prompt.includes('<quotes>');
            const reply = isConsistencyPass ? consistency : blind === 'invalid' ? 'invalid' : { answerIndex: blind };
            if (reply === 'invalid') throw new ModelOutputInvalid(request.promptVersion, 'bad');
            return { model: 'fake', value: request.schema.parse(reply) };
        },
    } as ModelProvider;
    return { prompts, provider };
}

describe('judgeQuestion', () => {
    it('passes a card when the source checks out, both models agree, and the judge finds it consistent', async () => {
        const claude = fakeModel(1);
        const codex = fakeModel(1);
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: claude.provider,
            codex: codex.provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome.status).toBe('judged');
        if (outcome.status !== 'judged') return;
        expect(outcome.question.provenance.validation).toEqual({
            evidence: { sources: [SOURCE], verdict: 'The quote supports the claim.' },
            method: 'judged',
            status: 'passed',
        });
        expect(claude.prompts).toHaveLength(2);
        expect(codex.prompts).toHaveLength(1);
        const bank = validateQuestionBank(
            { questions: [outcome.question], schemaVersion: 2 },
            { misconceptionIds: [], topicIds: ['sessions'] },
        );
        expect(bank.isValid && bank.questions).toHaveLength(1);
    });

    it('drops the draft with no model call when the quote is not on the page', async () => {
        const claude = fakeModel(1);
        const codex = fakeModel(1);
        const unrelated: SourceFetcher = async (url) => ({
            contentType: 'text/html',
            finalUrl: url,
            ok: true,
            text: '<p>unrelated</p>',
        });
        expect(
            await judgeQuestion(MC, [SOURCE], {
                claude: claude.provider,
                codex: codex.provider,
                fetchSource: unrelated,
            }),
        ).toEqual({ reason: 'source-unverified', status: 'dropped' });
        expect([...claude.prompts, ...codex.prompts]).toEqual([]);
    });

    it('drops the draft with no model call when the source cannot be fetched', async () => {
        const claude = fakeModel(1);
        const codex = fakeModel(1);
        const refused: SourceFetcher = async () => ({ ok: false, reason: 'host-not-allowed' });
        expect(
            await judgeQuestion(MC, [SOURCE], { claude: claude.provider, codex: codex.provider, fetchSource: refused }),
        ).toEqual({ reason: 'source-unverified', status: 'dropped' });
        expect([...claude.prompts, ...codex.prompts]).toEqual([]);
    });

    it('disputes a card Codex answers differently, without a consistency pass', async () => {
        const claude = fakeModel(1);
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: claude.provider,
            codex: fakeModel(2).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({
            card: {
                blindAnswers: { claude: 1, codex: 2 },
                claimedIndex: 1,
                consistency: null,
                failure: 'blind-disagreement',
            },
            status: 'disputed',
        });
        expect(claude.prompts).toHaveLength(1);
    });

    it('disputes a card Claude answers differently', async () => {
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: fakeModel(0).provider,
            codex: fakeModel(1).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({
            card: { blindAnswers: { claude: 0, codex: 1 }, failure: 'blind-disagreement' },
            status: 'disputed',
        });
    });

    it('records an invalid blind answer as null and disputes the card', async () => {
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: fakeModel(1).provider,
            codex: fakeModel('invalid').provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({ card: { blindAnswers: { claude: 1, codex: null } }, status: 'disputed' });
    });

    it('treats an out-of-range blind answer as null', async () => {
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: fakeModel(1).provider,
            codex: fakeModel(7).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({ card: { blindAnswers: { codex: null } }, status: 'disputed' });
    });

    it('disputes a card the judge finds inconsistent with the quote', async () => {
        const verdict = { isConsistent: false, reason: 'The explanation says Lax blocks GET too.' };
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: fakeModel(1, verdict).provider,
            codex: fakeModel(1).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({ card: { consistency: verdict, failure: 'inconsistent' }, status: 'disputed' });
    });

    it('disputes a card whose consistency pass returns invalid output', async () => {
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: fakeModel(1, 'invalid').provider,
            codex: fakeModel(1).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({ card: { consistency: null, failure: 'inconsistent' }, status: 'disputed' });
    });

    it('keeps the verified evidence on a disputed card, pending', async () => {
        const outcome = await judgeQuestion(MC, [SOURCE], {
            claude: fakeModel(1).provider,
            codex: fakeModel(0).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome.status === 'disputed' && outcome.card.question.provenance.validation).toMatchObject({
            evidence: { sources: [SOURCE] },
            method: 'judged',
            status: 'pending',
        });
    });

    it('never shows the claimed answer, the explanation, or a rationale to the blind models', async () => {
        const claude = fakeModel(1);
        const codex = fakeModel(1);
        await judgeQuestion(MC, [SOURCE], {
            claude: claude.provider,
            codex: codex.provider,
            fetchSource: pageWithQuote,
        });
        for (const prompt of [claude.prompts[0] as string, codex.prompts[0] as string]) {
            expect(prompt).toContain('What does SameSite=Lax block?');
            expect(prompt).toContain('Cross-site POST, not top-level GET');
            expect(prompt).not.toContain(EXPLANATION);
            expect(prompt).not.toContain(RATIONALE);
            expect(prompt).not.toContain('answerIndex": 1');
            expect(prompt).not.toContain('<quotes>');
        }
    });

    it('never shows a bool question its answer, explanation, or rationale', async () => {
        const bool = { ...MC, answer: true, rationale: RATIONALE, type: 'bool' } as unknown as Question;
        const claude = fakeModel(0);
        const codex = fakeModel(0);
        await judgeQuestion(bool, [SOURCE], {
            claude: claude.provider,
            codex: codex.provider,
            fetchSource: pageWithQuote,
        });
        for (const prompt of [claude.prompts[0] as string, codex.prompts[0] as string]) {
            expect(prompt).toContain('What does SameSite=Lax block?');
            expect(prompt).not.toContain(EXPLANATION);
            expect(prompt).not.toContain(RATIONALE);
            expect(prompt).not.toContain('"answer": true');
        }
    });

    it('maps a bool claim of true to choice 0 and disputes a false blind answer', async () => {
        const bool = { ...MC, answer: true, rationale: RATIONALE, type: 'bool' } as unknown as Question;
        const outcome = await judgeQuestion(bool, [SOURCE], {
            claude: fakeModel(0).provider,
            codex: fakeModel(1).provider,
            fetchSource: pageWithQuote,
        });
        expect(outcome).toMatchObject({
            card: { blindAnswers: { claude: 0, codex: 1 }, claimedIndex: 0 },
            status: 'disputed',
        });
    });

    it('lets a codex CLI failure stop the run instead of disputing the card', async () => {
        const broken = {
            generate: async () => {
                throw new Error(
                    'codex CLI failed (codex could not start: spawn codex ENOENT); install it and run `codex login`',
                );
            },
        } as unknown as ModelProvider;
        await expect(
            judgeQuestion(MC, [SOURCE], { claude: fakeModel(1).provider, codex: broken, fetchSource: pageWithQuote }),
        ).rejects.toThrow(/codex login/);
    });
});
