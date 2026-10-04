// A judged-and-passed provenance needs evidence: 1 to 3 sources, each an https URL with a
// non-blank title and quote, plus a verdict. Evidence elsewhere must still be well formed.
import { describe, expect, it } from 'vitest';

import { isValidProvenance } from '../isValidProvenance.js';
import { validateQuestionBank } from '../validateQuestionBank.js';

const SOURCE = {
  url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
  title: 'SQL Injection Prevention Cheat Sheet',
  quote: 'Use of Prepared Statements (with Parameterized Queries)',
};

function buildProvenance(validation: Record<string, unknown>): Record<string, unknown> {
  return { source: 'generated', isHumanReviewed: false, validation };
}

function judgedPassed(evidence: unknown): Record<string, unknown> {
  return buildProvenance({ method: 'judged', status: 'passed', evidence });
}

describe('isValidProvenance evidence', () => {
  it('accepts judged/passed with one valid source and a verdict', () => {
    expect(isValidProvenance(judgedPassed({ sources: [SOURCE], verdict: 'Consistent with the quote.' }))).toBe(true);
  });

  it('accepts judged/pending and executed/passed without evidence', () => {
    expect(isValidProvenance(buildProvenance({ method: 'judged', status: 'pending' }))).toBe(true);
    expect(isValidProvenance(buildProvenance({ method: 'executed', status: 'passed' }))).toBe(true);
  });

  it.each([
    ['no evidence', undefined],
    ['no sources', { sources: [], verdict: 'v' }],
    ['four sources', { sources: [SOURCE, SOURCE, SOURCE, SOURCE], verdict: 'v' }],
    ['an empty title', { sources: [{ ...SOURCE, title: '' }], verdict: 'v' }],
    ['a whitespace title', { sources: [{ ...SOURCE, title: '   ' }], verdict: 'v' }],
    ['an empty quote', { sources: [{ ...SOURCE, quote: '' }], verdict: 'v' }],
    ['a whitespace quote', { sources: [{ ...SOURCE, quote: '  \t ' }], verdict: 'v' }],
    ['an http url', { sources: [{ ...SOURCE, url: 'http://owasp.org/x' }], verdict: 'v' }],
    ['a javascript url', { sources: [{ ...SOURCE, url: 'javascript:alert(1)' }], verdict: 'v' }],
    [
      'a url over 2048 characters',
      { sources: [{ ...SOURCE, url: `https://owasp.org/${'a'.repeat(2048)}` }], verdict: 'v' },
    ],
    ['no verdict', { sources: [SOURCE] }],
    ['sources that are not an array', { sources: 'x', verdict: 'v' }],
  ])('rejects judged/passed with %s', (_name, evidence) => {
    expect(isValidProvenance(judgedPassed(evidence))).toBe(false);
  });

  it('rejects malformed evidence on an executed/passed provenance', () => {
    expect(
      isValidProvenance(buildProvenance({ method: 'executed', status: 'passed', evidence: { sources: 'x' } })),
    ).toBe(false);
  });

  it("drops a judged/passed question without evidence from a bank as 'missing-provenance'", () => {
    const base = {
      type: 'bool',
      prompt: 'SameSite=Lax withholds cookies on a cross-site POST.',
      answer: true,
      query: { title: 'SameSite', explanation: 'Lax blocks cross-site POST cookies.' },
    };
    const kept = { ...base, id: 'q-1', provenance: judgedPassed({ sources: [SOURCE], verdict: 'ok' }) };
    const dropped = { ...base, id: 'q-2', provenance: judgedPassed(undefined) };
    const result = validateQuestionBank(
      { schemaVersion: 2, questions: [kept, dropped] },
      { topicIds: [], misconceptionIds: [] },
    );
    expect(result).toEqual({
      dropped: [{ id: 'q-2', rule: 'missing-provenance' }],
      droppedQuestionIds: ['q-2'],
      isValid: true,
      questions: [kept],
    });
  });
});
