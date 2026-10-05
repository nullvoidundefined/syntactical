import type { Question } from '@syntactical/content-schema';

import { readEvidenceSource } from '../readEvidenceSource';

const SOURCE = {
  quote: 'Lax cookies are not sent on cross-site POST requests',
  title: 'Using HTTP cookies',
  url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};

function buildQuestion(validation: Record<string, unknown>): Question {
  return {
    answer: true,
    id: 'q-1',
    prompt: 'p',
    provenance: { isHumanReviewed: false, source: 'generated', validation },
    query: { explanation: 'e', title: 't' },
    type: 'bool',
  } as unknown as Question;
}

describe('readEvidenceSource', () => {
  it('returns the first source of a judged card', () => {
    const second = { ...SOURCE, title: 'Second' };
    expect(
      readEvidenceSource(
        buildQuestion({ evidence: { sources: [SOURCE, second], verdict: 'ok' }, method: 'judged', status: 'passed' }),
      ),
    ).toEqual(SOURCE);
  });

  it.each([
    [
      'an executed card with evidence',
      { evidence: { sources: [SOURCE], verdict: 'ok' }, method: 'executed', status: 'passed' },
    ],
    ['a judged card with no evidence', { method: 'judged', status: 'pending' }],
    [
      'an empty title',
      { evidence: { sources: [{ ...SOURCE, title: '' }], verdict: 'ok' }, method: 'judged', status: 'passed' },
    ],
    [
      'a whitespace title',
      { evidence: { sources: [{ ...SOURCE, title: '   ' }], verdict: 'ok' }, method: 'judged', status: 'passed' },
    ],
    [
      'an http url',
      {
        evidence: { sources: [{ ...SOURCE, url: 'http://developer.mozilla.org/x' }], verdict: 'ok' },
        method: 'judged',
        status: 'passed',
      },
    ],
  ])('returns undefined for %s', (_name, validation) => {
    expect(readEvidenceSource(buildQuestion(validation))).toBeUndefined();
  });
});
