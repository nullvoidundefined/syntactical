// A shuffled multiple choice answer maps back to its bank index; true/false and A/B pass through.
import type { Question } from '@syntactical/content-schema';

import { TEST_PROVENANCE } from '../../content/__tests__/fixtures/contentFixtures';
import type { RoundQuestion } from '../shuffleChoices';
import { toBankChoiceIndex } from '../toBankChoiceIndex';

const base = { id: 'q', prompt: 'Pick', provenance: TEST_PROVENANCE, query: { explanation: 'e', title: 't' } };

describe('toBankChoiceIndex', () => {
  it('maps a displayed multiple choice index to the bank index', () => {
    const question = {
      ...base,
      answerIndex: 2,
      bankChoiceIndexes: [3, 0, 1, 2],
      choices: [{ text: 'd' }, { text: 'a' }, { text: 'b' }, { text: 'c' }],
      type: 'mc',
    } as RoundQuestion;

    expect(toBankChoiceIndex(question, 0)).toBe(3);
    expect(toBankChoiceIndex(question, 2)).toBe(1);
  });

  it('maps True to 0 and False to 1', () => {
    const question = { ...base, answer: true, type: 'bool' } as Question as RoundQuestion;

    expect(toBankChoiceIndex(question, true)).toBe(0);
    expect(toBankChoiceIndex(question, false)).toBe(1);
  });
});
