import type { Question } from '@syntactical/content-schema';

import { TEST_PROVENANCE } from '../../content/__tests__/fixtures/contentFixtures';
import { readChosenRationale } from '../readChosenRationale';

const query = { explanation: 'e', title: 't' };
const mc: Question = {
  answerIndex: 1,
  choices: [{ rationale: 'why first', text: 'a' }, { rationale: 'ignored', text: 'b' }, { text: 'c' }],
  id: 'mc',
  prompt: 'p',
  provenance: TEST_PROVENANCE,
  query,
  type: 'mc',
};
const bool: Question = { answer: true, id: 'bool', prompt: 'p', provenance: TEST_PROVENANCE, query, rationale: 'why false', type: 'bool' };

describe('readChosenRationale', () => {
  it('returns the chosen wrong choice rationale, and nothing for the correct, missing, or out-of-range choice', () => {
    expect(readChosenRationale(mc, 0)).toBe('why first');
    expect(readChosenRationale(mc, 1)).toBeUndefined();
    expect(readChosenRationale(mc, 2)).toBeUndefined();
    expect(readChosenRationale(mc, 9)).toBeUndefined();
    expect(readChosenRationale(mc, null)).toBeUndefined();
  });

  it('returns the question rationale only when the wrong boolean was chosen', () => {
    expect(readChosenRationale(bool, false)).toBe('why false');
    expect(readChosenRationale(bool, true)).toBeUndefined();
  });
});
