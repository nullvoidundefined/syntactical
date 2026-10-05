// A judged + passed card needs source evidence, except a readability A/B card, whose judge
// records its evidence on the criterion. The exemption covers nothing else, and publish still
// demands a human approval for every readability card it lets through.
import { describe, expect, it } from 'vitest';

import { hasValidQuestionProvenance } from '../hasValidQuestionProvenance.js';
import { validateBankForPublish } from '../validateBankForPublish.js';
import { validateQuestionBank } from '../validateQuestionBank.js';

const JUDGED_PASSED = { method: 'judged', status: 'passed' };

function buildAb(criterion: Record<string, unknown>, validation: Record<string, unknown> = JUDGED_PASSED) {
  return {
    answerIndex: 0,
    choices: [
      { code: 'total = sum(xs)', text: 'sum' },
      { code: 'total = 0\nfor x in xs: total += x', rationale: 'Spells out what sum already does.', text: 'loop' },
    ],
    criterion,
    id: 'q-ab',
    prompt: 'Which is better?',
    provenance: { isHumanReviewed: false, source: 'generated', validation },
    query: { explanation: 'e', title: 't' },
    type: 'ab',
  };
}

const READABILITY = {
  evidence: 'Option A says what it does in one call.',
  statement: 'Easier to read',
  type: 'readability',
};

describe('hasValidQuestionProvenance', () => {
  it('accepts a judged + passed readability A/B card whose criterion carries evidence', () => {
    expect(hasValidQuestionProvenance(buildAb(READABILITY))).toBe(true);
  });

  it.each(['performance', 'correctness'])('rejects a judged + passed %s A/B card without source evidence', (type) => {
    expect(hasValidQuestionProvenance(buildAb({ ...READABILITY, type }))).toBe(false);
  });

  it.each(['', '   '])('rejects a readability A/B card whose criterion evidence is blank (%j)', (evidence) => {
    expect(hasValidQuestionProvenance(buildAb({ ...READABILITY, evidence }))).toBe(false);
  });

  it('rejects a judged + passed bool card without source evidence', () => {
    const card = {
      answer: true,
      id: 'q-bool',
      prompt: 'p',
      provenance: { isHumanReviewed: false, source: 'generated', validation: JUDGED_PASSED },
      query: { explanation: 'e', title: 't' },
      type: 'bool',
    };
    expect(hasValidQuestionProvenance(card)).toBe(false);
  });

  it('rejects a readability card whose other provenance fields are invalid', () => {
    expect(hasValidQuestionProvenance(buildAb(READABILITY, { method: 'guessed', status: 'passed' }))).toBe(false);
  });
});

describe('the readability exemption through the bank validators', () => {
  // A second, executed card keeps the bank valid, so a dropped card shows up in `dropped`.
  const EXECUTED = {
    answer: true,
    id: 'q-ok',
    prompt: 'p',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'executed', status: 'passed' } },
    query: { explanation: 'e', title: 't' },
    rationale: 'r',
    type: 'bool',
  };

  function droppedIds(question: Record<string, unknown>): unknown {
    const result = validateQuestionBank(
      { questions: [question, EXECUTED], schemaVersion: 2 },
      { misconceptionIds: [], topicIds: [] },
    );
    return result.isValid ? result.dropped : result.rule;
  }

  it('keeps a readability card and drops a performance card that lacks source evidence', () => {
    expect(droppedIds(buildAb(READABILITY))).toEqual([]);
    expect(droppedIds(buildAb({ ...READABILITY, type: 'performance' }))).toEqual([
      { id: 'q-ab', rule: 'missing-provenance' },
    ]);
  });

  it('refuses to publish a card that claims readability but was never human approved', () => {
    const bank = { questions: [{ ...buildAb(READABILITY), topic: 'iterables' }] } as unknown as Parameters<
      typeof validateBankForPublish
    >[0];
    expect(validateBankForPublish(bank, { misconceptionIds: [], topicIds: ['iterables'] }).problems).toEqual([
      { id: 'q-ab', rule: 'readability-unreviewed' },
    ]);
  });
});
