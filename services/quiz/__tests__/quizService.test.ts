import type { Question } from '../../content/types/Question';
import { calculateAccuracy } from '../calculateAccuracy';
import { isAnswerCorrect } from '../isAnswerCorrect';
import { shuffleQuestions } from '../shuffleQuestions';

const query = { explanation: 'e', title: 't' };

describe('quiz service', () => {
  it('returns a new permutation containing every item exactly once', () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const shuffled = shuffleQuestions(items);
    expect([...shuffled].sort((left, right) => left - right)).toEqual(items);
    expect(shuffled).not.toBe(items);
  });

  it('uses the injected random source', () => {
    expect(shuffleQuestions([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });

  it('grades multiple-choice and boolean answers', () => {
    const mcQuestion: Question = { answerIndex: 1, choices: ['x', 'y'], id: 'a', prompt: 'p', query, type: 'mc' };
    const boolQuestion: Question = { answer: false, id: 'b', prompt: 'p', query, type: 'bool' };
    expect(isAnswerCorrect(mcQuestion, 1)).toBe(true);
    expect(isAnswerCorrect(mcQuestion, 0)).toBe(false);
    expect(isAnswerCorrect(boolQuestion, true)).toBe(false);
    expect(isAnswerCorrect(boolQuestion, false)).toBe(true);
  });

  it('rounds accuracy and returns 0 for an empty round', () => {
    expect(calculateAccuracy(2, 3)).toBe(67);
    expect(calculateAccuracy(0, 0)).toBe(0);
  });
});
