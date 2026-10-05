import type { Question } from '@syntactical/content-schema';

import { TEST_PROVENANCE } from '../../content/__tests__/fixtures/contentFixtures';
import { shuffleChoices } from '../shuffleChoices';

type McQuestion = Extract<Question, { type: 'mc' }>;

const query = { explanation: 'e', title: 't' };
const mcQuestion = {
  answerIndex: 0,
  choices: [
    { misconceptionId: 'm-right', rationale: 'why right', text: 'right' },
    { misconceptionId: 'm-1', rationale: 'why one', text: 'wrong-1' },
    { misconceptionId: 'm-2', rationale: 'why two', text: 'wrong-2' },
    { misconceptionId: 'm-3', rationale: 'why three', text: 'wrong-3' },
  ],
  id: 'q-mc',
  prompt: 'Pick one',
  query,
  provenance: TEST_PROVENANCE,
  type: 'mc',
} as McQuestion;
const abQuestion = {
  answerIndex: 0,
  choices: [{ text: 'first' }, { text: 'second' }],
  criterion: 'A reads better than B',
  id: 'q-ab',
  prompt: 'Which?',
  query,
  provenance: TEST_PROVENANCE,
  type: 'ab',
} as unknown as Question;
const boolQuestion = {
  answer: true,
  id: 'q-bool',
  prompt: 'Is it?',
  query,
  provenance: TEST_PROVENANCE,
  type: 'bool',
} as Question;

// mulberry32: well mixed even for small consecutive seeds (a plain LCG's first outputs are not).
function buildSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function readCorrectChoice(question: Question) {
  if (question.type === 'bool') throw new Error('not a choice question');
  return question.choices[question.answerIndex];
}

describe('shuffleChoices', () => {
  it('reorders an mc question so the answerIndex still points at the same correct choice', () => {
    const shuffled = shuffleChoices(mcQuestion, () => 0) as McQuestion;
    expect(shuffled.choices.map((choice) => choice.text)).not.toEqual(mcQuestion.choices.map((choice) => choice.text));
    expect([...shuffled.choices.map((choice) => choice.text)].sort()).toEqual(
      mcQuestion.choices.map((choice) => choice.text).sort(),
    );
    expect(shuffled.choices[shuffled.answerIndex]).toEqual(mcQuestion.choices[0]);
    expect(shuffled.choices[shuffled.answerIndex].misconceptionId).toBe('m-right');
  });

  it('carries each choice rationale and misconceptionId with its text', () => {
    const shuffled = shuffleChoices(mcQuestion, buildSeededRandom(5)) as McQuestion;
    for (const choice of shuffled.choices) {
      const original = mcQuestion.choices.find((candidate) => candidate.text === choice.text);
      expect(choice).toEqual(original);
    }
  });

  it('is deterministic for a fixed random source', () => {
    expect(shuffleChoices(mcQuestion, buildSeededRandom(9))).toEqual(shuffleChoices(mcQuestion, buildSeededRandom(9)));
  });

  it('puts the correct answer in each of the four positions across a fixed set of seeds', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const shuffled = shuffleChoices(mcQuestion, buildSeededRandom(seed)) as McQuestion;
      expect(readCorrectChoice(shuffled).text).toBe('right');
      positions.add(shuffled.answerIndex);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('does not mutate the question it was given', () => {
    const before = JSON.parse(JSON.stringify(mcQuestion));
    const result = shuffleChoices(mcQuestion, () => 0);
    expect(result).not.toBe(mcQuestion);
    expect(mcQuestion).toEqual(before);
  });

  it('keeps ab choices in order and leaves bool questions unchanged', () => {
    expect(shuffleChoices(abQuestion, () => 0)).toEqual(abQuestion);
    expect(shuffleChoices(boolQuestion, () => 0)).toEqual(boolQuestion);
  });
});
