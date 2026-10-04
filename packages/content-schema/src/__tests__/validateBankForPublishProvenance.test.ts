// The publish check refuses a question whose provenance is invalid, such as judged/passed with no evidence.
import { describe, expect, it } from 'vitest';

import type { Question } from '../types/Question.js';
import { validateBankForPublish } from '../validateBankForPublish.js';

function buildBool(id: string, validation: Record<string, unknown>): Question {
  return {
    id,
    type: 'bool',
    topic: 'cookies',
    prompt: 'SameSite=Lax withholds cookies on a cross-site POST.',
    answer: true,
    rationale: 'Lax only sends cookies on top-level GET navigations.',
    query: { title: 'SameSite', explanation: 'Lax blocks cross-site POST cookies.' },
    provenance: { source: 'generated', isHumanReviewed: false, validation },
  } as unknown as Question;
}

describe('validateBankForPublish provenance', () => {
  it("reports 'invalid-provenance' for judged/passed without evidence", () => {
    const question = buildBool('q-1', { method: 'judged', status: 'passed' });
    const { problems } = validateBankForPublish(
      { questions: [question] },
      { topicIds: ['cookies'], misconceptionIds: [] },
    );
    expect(problems).toEqual([{ id: 'q-1', rule: 'invalid-provenance' }]);
  });

  it('reports nothing for judged/passed with evidence', () => {
    const question = buildBool('q-1', {
      method: 'judged',
      status: 'passed',
      evidence: {
        sources: [
          {
            url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
            title: 'Using HTTP cookies',
            quote: 'Cookies are sent only on same-site requests and top-level navigations',
          },
        ],
        verdict: 'Consistent.',
      },
    });
    const { problems } = validateBankForPublish(
      { questions: [question] },
      { topicIds: ['cookies'], misconceptionIds: [] },
    );
    expect(problems).toEqual([]);
  });
});
