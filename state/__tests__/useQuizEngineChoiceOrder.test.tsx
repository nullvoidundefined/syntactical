import type { Question } from '@syntactical/content-schema';
import { renderHook } from '@testing-library/react-native';

import { TEST_PROVENANCE } from '../../services/content/__tests__/fixtures/contentFixtures';
import { isAnswerCorrect } from '../../services/quiz/isAnswerCorrect';
import { useQuizEngine } from '../useQuizEngine';

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

function readTexts(question: Question | null): string[] {
  if (!question || question.type === 'bool') throw new Error('expected a choice question');
  return question.choices.map((choice) => choice.text);
}

afterEach(() => jest.restoreAllMocks());

describe('useQuizEngine choice order', () => {
  it('shuffles an mc question once per round and scores the displayed correct choice as correct', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { result, rerender } = await renderHook(() => useQuizEngine([mcQuestion]));
    const shownTexts = readTexts(result.current.currentQuestion);
    expect(shownTexts).not.toEqual(readTexts(mcQuestion));
    const correctPosition = shownTexts.indexOf('right');
    const wrongPosition = shownTexts.indexOf('wrong-1');

    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    await rerender({});
    expect(readTexts(result.current.currentQuestion)).toEqual(shownTexts);

    const current = result.current.currentQuestion as McQuestion;
    expect(isAnswerCorrect(current, correctPosition)).toBe(true);
    expect(isAnswerCorrect(current, wrongPosition)).toBe(false);
    expect(current.choices[wrongPosition].rationale).toBe('why one');
  });

  it('shuffles the questions of a review round too', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = await renderHook(() => useQuizEngine([mcQuestion], { roundKind: 'review' }));
    const current = result.current.currentQuestion as McQuestion;
    expect(readTexts(current)).not.toEqual(readTexts(mcQuestion));
    expect(current.choices[current.answerIndex].text).toBe('right');
  });

  it('keeps ab and bool questions as they are', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = await renderHook(() => useQuizEngine([abQuestion, boolQuestion]));
    expect(result.current.totalQuestions).toBe(2);
    // Shuffling the question order is allowed; the questions themselves must be untouched.
    const first = result.current.currentQuestion;
    expect(first).toEqual(first?.type === 'ab' ? abQuestion : boolQuestion);
  });

  it('does not mutate the source bank', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const bank = [JSON.parse(JSON.stringify(mcQuestion)) as McQuestion];
    const snapshot = JSON.parse(JSON.stringify(bank));
    const { result } = await renderHook(() => useQuizEngine(bank));
    expect(readTexts(result.current.currentQuestion)).not.toEqual(readTexts(snapshot[0]));
    expect(bank).toEqual(snapshot);
  });
});
