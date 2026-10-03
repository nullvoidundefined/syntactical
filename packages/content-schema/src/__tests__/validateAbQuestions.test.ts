// B-6: an `ab` question ("which of two snippets is optimal?") is accepted only
// with exactly two choices, answerIndex 0 or 1, and a criterion
// { type: 'performance' | 'correctness' | 'readability', statement, evidence }
// whose statement and evidence are non-empty (not whitespace-only) strings of at
// most CONTENT_LIMITS.longTextLength characters. Any violation drops the question
// as 'malformed question' and keeps the rest of the bank. Topic, provenance,
// rationale-length, and reference rules apply to `ab` exactly as to `mc`, and
// validateBankForPublish treats a validated `ab` question like an `mc` one.
//
// Every drop case keeps a valid `ab` question beside the dropped one, so each
// assertion also proves that a well-formed `ab` question survives validation.
import { describe, expect, it } from 'vitest';

import { CONTENT_LIMITS } from '../contentLimits.js';
import { validateBankForPublish } from '../validateBankForPublish.js';
import { validateQuestionBank } from '../validateQuestionBank.js';
import type { BankContext } from '../types/BankContext.js';

type QuestionFixture = Record<string, unknown>;

const CONTEXT: BankContext = {
    topicIds: ['iterables', 'strings'],
    misconceptionIds: ['python.off-by-one', 'python.x'],
};

const LONG_TEXT_LIMIT = CONTENT_LIMITS.longTextLength;

function buildProvenance(): QuestionFixture {
    return { source: 'original', validation: { method: 'executed', status: 'passed' }, isHumanReviewed: false };
}

function buildCriterion(overrides: QuestionFixture = {}): QuestionFixture {
    return {
        type: 'performance',
        statement: 'Which snippet builds the joined string faster for 10,000 items?',
        evidence: 'str.join ran in 0.4 ms; repeated += ran in 3.1 ms on CPython 3.12.',
        ...overrides,
    };
}

function buildAbQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return {
        id,
        type: 'ab',
        prompt: 'Which snippet is faster?',
        choices: [{ text: 'Snippet A' }, { text: 'Snippet B' }],
        answerIndex: 0,
        criterion: buildCriterion(),
        query: { title: 'Joining strings', explanation: 'str.join allocates the result once.' },
        provenance: buildProvenance(),
        ...overrides,
    };
}

function buildAbQuestionWithCode(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return buildAbQuestion(id, {
        choices: [
            { text: 'Snippet A', code: "''.join(parts)" },
            { text: 'Snippet B', code: "out = ''\nfor part in parts:\n    out += part" },
        ],
        ...overrides,
    });
}

// Carries every enrichment the publish check requires, so the only publish
// problems reported are the ones under test.
function buildEnrichedAbQuestion(id: string, overrides: QuestionFixture = {}): QuestionFixture {
    return buildAbQuestionWithCode(id, {
        topic: 'strings',
        choices: [
            { text: 'Snippet A', code: "''.join(parts)" },
            {
                text: 'Snippet B',
                code: "out = ''\nfor part in parts:\n    out += part",
                rationale: 'Each += copies the whole string built so far.',
                misconceptionId: 'python.x',
            },
        ],
        ...overrides,
    });
}

function withoutField(record: QuestionFixture, field: string): QuestionFixture {
    const copy = { ...record };
    delete copy[field];
    return copy;
}

function buildBank(questions: unknown[]): Record<string, unknown> {
    return { schemaVersion: 2, questions };
}

function bankWithDrops(kept: unknown[], drops: { id: string; rule: string }[]): Record<string, unknown> {
    return {
        isValid: true,
        questions: kept,
        droppedQuestionIds: drops.map((drop) => drop.id),
        dropped: drops,
    };
}

function expectKeepsValidAndDrops(bad: QuestionFixture, rule: string): void {
    const kept = buildAbQuestion('q-kept');
    const result = validateQuestionBank(buildBank([kept, bad]), CONTEXT);
    expect(result).toStrictEqual(bankWithDrops([kept], [{ id: bad.id as string, rule }]));
}

function expectMalformed(bad: QuestionFixture): void {
    expectKeepsValidAndDrops(bad, 'malformed question');
}

// Publish runs on validated content: the question must first survive
// validateQuestionBank, then validateBankForPublish reports its problems.
function validateThenPublish(question: QuestionFixture): { problems: { id: string; rule: string }[] } {
    const result = validateQuestionBank(buildBank([question]), CONTEXT);
    expect(result).toStrictEqual(bankWithDrops([question], []));
    const questions = (result as { questions: unknown[] }).questions;
    const bank = { questions } as unknown as Parameters<typeof validateBankForPublish>[0];
    return validateBankForPublish(bank, CONTEXT);
}

describe('validateQuestionBank ab questions (B-6)', () => {
    describe('valid ab questions are kept unchanged', () => {
        it('keeps an ab question whose choices carry no code', () => {
            const question = buildAbQuestion('q-1');
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toStrictEqual(bankWithDrops([buildAbQuestion('q-1')], []));
        });

        it('keeps an ab question whose choices carry code', () => {
            const question = buildAbQuestionWithCode('q-1');
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toStrictEqual(bankWithDrops([buildAbQuestionWithCode('q-1')], []));
        });

        it('keeps an ab question with answerIndex 1', () => {
            const question = buildAbQuestion('q-1', { answerIndex: 1 });
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toStrictEqual(bankWithDrops([question], []));
        });

        it.each(['performance', 'correctness', 'readability'])('keeps an ab question with criterion type %s', (type) => {
            const question = buildAbQuestion('q-1', { criterion: buildCriterion({ type }) });
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toStrictEqual(bankWithDrops([question], []));
        });

        it('keeps an ab question whose statement and evidence are exactly at the length limit', () => {
            const question = buildAbQuestion('q-1', {
                criterion: buildCriterion({ statement: 's'.repeat(LONG_TEXT_LIMIT), evidence: 'e'.repeat(LONG_TEXT_LIMIT) }),
            });
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toStrictEqual(bankWithDrops([question], []));
        });

        it('keeps an ab question with a listed topic and listed choice misconceptionIds and rationales', () => {
            const question = buildEnrichedAbQuestion('q-1');
            const result = validateQuestionBank(buildBank([question]), CONTEXT);
            expect(result).toStrictEqual(bankWithDrops([question], []));
        });
    });

    describe('choices', () => {
        it('drops an ab question with one choice', () => {
            expectMalformed(buildAbQuestion('q-bad', { choices: [{ text: 'Snippet A' }] }));
        });

        it('drops an ab question with three choices', () => {
            expectMalformed(
                buildAbQuestion('q-bad', {
                    choices: [{ text: 'Snippet A' }, { text: 'Snippet B' }, { text: 'Snippet C' }],
                }),
            );
        });

        it('drops an ab question whose choice is a plain string', () => {
            expectMalformed(buildAbQuestion('q-bad', { choices: ['Snippet A', { text: 'Snippet B' }] }));
        });

        it('drops an ab question whose choice code is over the length limit', () => {
            expectMalformed(
                buildAbQuestion('q-bad', {
                    choices: [{ text: 'Snippet A', code: 'x'.repeat(LONG_TEXT_LIMIT + 1) }, { text: 'Snippet B' }],
                }),
            );
        });
    });

    describe('answerIndex', () => {
        it.each([
            ['2', 2],
            ['-1', -1],
            ['0.5', 0.5],
            ["the string '0'", '0'],
        ])('drops an ab question whose answerIndex is %s', (_label, answerIndex) => {
            expectMalformed(buildAbQuestion('q-bad', { answerIndex }));
        });

        it('drops an ab question with no answerIndex', () => {
            expectMalformed(withoutField(buildAbQuestion('q-bad'), 'answerIndex'));
        });
    });

    describe('criterion', () => {
        it('drops an ab question with no criterion', () => {
            expectMalformed(withoutField(buildAbQuestion('q-bad'), 'criterion'));
        });

        it('drops an ab question whose criterion is null', () => {
            expectMalformed(buildAbQuestion('q-bad', { criterion: null }));
        });

        it('drops an ab question whose criterion is a string', () => {
            expectMalformed(buildAbQuestion('q-bad', { criterion: 'performance' }));
        });

        it("drops an ab question whose criterion type is 'speed'", () => {
            expectMalformed(buildAbQuestion('q-bad', { criterion: buildCriterion({ type: 'speed' }) }));
        });

        it('drops an ab question whose criterion has no type', () => {
            expectMalformed(buildAbQuestion('q-bad', { criterion: withoutField(buildCriterion(), 'type') }));
        });

        describe.each(['statement', 'evidence'])('criterion.%s', (field) => {
            it(`drops an ab question whose criterion has no ${field}`, () => {
                expectMalformed(buildAbQuestion('q-bad', { criterion: withoutField(buildCriterion(), field) }));
            });

            it.each([
                ['empty', ''],
                ['whitespace-only', '   \n\t'],
                ['a number', 42],
                ['null', null],
                ['over the length limit', 'x'.repeat(LONG_TEXT_LIMIT + 1)],
            ])(`drops an ab question whose criterion ${field} is %s`, (_label, value) => {
                expectMalformed(buildAbQuestion('q-bad', { criterion: buildCriterion({ [field]: value }) }));
            });
        });
    });

    describe('rules shared with mc', () => {
        it('drops an ab question whose topic is not listed, with unknown-topic', () => {
            expectKeepsValidAndDrops(buildAbQuestion('q-bad', { topic: 'dictionaries' }), 'unknown-topic');
        });

        it('drops an ab question with an unlisted choice misconceptionId, with unknown-misconception', () => {
            expectKeepsValidAndDrops(
                buildAbQuestion('q-bad', {
                    choices: [{ text: 'Snippet A' }, { text: 'Snippet B', misconceptionId: 'python.not-in-taxonomy' }],
                }),
                'unknown-misconception',
            );
        });

        it('drops an ab question with no provenance, with missing-provenance', () => {
            expectKeepsValidAndDrops(withoutField(buildAbQuestion('q-bad'), 'provenance'), 'missing-provenance');
        });

        it('drops an ab question whose choice rationale is over the rationale limit, with rationale-too-long', () => {
            expectKeepsValidAndDrops(
                buildAbQuestion('q-bad', {
                    choices: [
                        { text: 'Snippet A' },
                        { text: 'Snippet B', rationale: 'r'.repeat(CONTENT_LIMITS.rationaleLength + 1) },
                    ],
                }),
                'rationale-too-long',
            );
        });
    });
});

describe('validateBankForPublish ab questions (B-6)', () => {
    it('reports no problems for a fully enriched ab question whose correct choice has no rationale', () => {
        expect(validateThenPublish(buildEnrichedAbQuestion('q-1'))).toStrictEqual({ problems: [] });
    });

    it('reports one missing-rationale when the wrong ab choice has no rationale', () => {
        const question = buildEnrichedAbQuestion('q-1', {
            choices: [{ text: 'Snippet A' }, { text: 'Snippet B' }],
        });
        expect(validateThenPublish(question)).toStrictEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it('checks the rationale of the wrong choice when answerIndex is 1', () => {
        const question = buildEnrichedAbQuestion('q-1', {
            answerIndex: 1,
            choices: [{ text: 'Snippet A' }, { text: 'Snippet B', rationale: 'Copies on every +=.' }],
        });
        expect(validateThenPublish(question)).toStrictEqual({ problems: [{ id: 'q-1', rule: 'missing-rationale' }] });
    });

    it('reports missing-topic for an ab question with no topic', () => {
        const question = withoutField(buildEnrichedAbQuestion('q-1'), 'topic');
        expect(validateThenPublish(question)).toStrictEqual({ problems: [{ id: 'q-1', rule: 'missing-topic' }] });
    });
});
