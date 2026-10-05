// verdictOf and decideQuestion for judged cards: judged + passed with valid evidence is a verdict
// and is published as judged with its evidence; judged without valid evidence, or pending, is
// no verdict; the executed path is unchanged.
import type { Question } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { decideQuestion } from '../../../services/publish/decideQuestion.js';
import { verdictOf } from '../../../services/publish/verdictOf.js';

const EVIDENCE = {
    sources: [
        {
            quote: 'Lax cookies are not sent on cross-site POST requests',
            title: 'Using HTTP cookies',
            url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
        },
    ],
    verdict: 'Supported.',
};

function buildQuestion(validation: Record<string, unknown>, runtimeVersion?: string): Question {
    return {
        answer: true,
        id: 'q-1',
        prompt: 'p',
        provenance: {
            isHumanReviewed: false,
            source: 'generated',
            validation,
            ...(runtimeVersion ? { runtimeVersion } : {}),
        },
        query: { explanation: 'e', title: 't' },
        rationale: 'r',
        topic: 'sessions',
        type: 'bool',
    } as unknown as Question;
}

describe('verdictOf', () => {
    it('treats judged and passed with valid evidence as a judged verdict', () => {
        expect(verdictOf(buildQuestion({ evidence: EVIDENCE, method: 'judged', status: 'passed' }), undefined)).toEqual(
            {
                evidence: EVIDENCE,
                method: 'judged',
                status: 'passed',
            },
        );
    });

    it.each([
        ['no evidence', { method: 'judged', status: 'passed' }],
        [
            'an http source',
            {
                evidence: { ...EVIDENCE, sources: [{ ...EVIDENCE.sources[0], url: 'http://developer.mozilla.org/x' }] },
                method: 'judged',
                status: 'passed',
            },
        ],
        ['a pending judgement', { evidence: EVIDENCE, method: 'judged', status: 'pending' }],
    ])('reads judged with %s as no verdict', (_name, validation) => {
        expect(verdictOf(buildQuestion(validation), undefined)).toEqual({ status: 'none' });
    });

    it('keeps the executed verdict unchanged', () => {
        expect(verdictOf(buildQuestion({ method: 'executed', status: 'passed' }, 'Python 3.13.1'), undefined)).toEqual({
            runtimeVersion: 'Python 3.13.1',
            status: 'passed',
        });
    });

    it('lets a validate report entry win over the question provenance', () => {
        expect(
            verdictOf(buildQuestion({ evidence: EVIDENCE, method: 'judged', status: 'passed' }), { status: 'failed' }),
        ).toEqual({ status: 'failed' });
    });
});

describe('decideQuestion with a judged verdict', () => {
    it('publishes it as judged and passed with its evidence', () => {
        const question = buildQuestion({ evidence: EVIDENCE, method: 'judged', status: 'passed' });
        const outcome = decideQuestion(question, { evidence: EVIDENCE, method: 'judged', status: 'passed' }, undefined);
        expect('question' in outcome && outcome.question.provenance.validation).toEqual({
            evidence: EVIDENCE,
            method: 'judged',
            status: 'passed',
        });
    });

    it('still publishes an executed verdict as executed', () => {
        const outcome = decideQuestion(
            buildQuestion({ method: 'executed', status: 'pending' }),
            { status: 'passed' },
            undefined,
        );
        expect('question' in outcome && outcome.question.provenance.validation).toEqual({
            method: 'executed',
            status: 'passed',
        });
    });

    it('refuses a judged card the owner rejected', () => {
        const question = buildQuestion({ evidence: EVIDENCE, method: 'judged', status: 'passed' });
        const outcome = decideQuestion(question, { evidence: EVIDENCE, method: 'judged', status: 'passed' }, {
            decision: 'reject',
            isHumanReviewed: false,
        } as never);
        expect(outcome).toEqual({ reason: 'rejected' });
    });
});
