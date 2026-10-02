import { act, renderHook } from '@testing-library/react-native';

import type { Question } from '../../services/content/types/Question';
import { useQuizEngine } from '../useQuizEngine';

const query = { explanation: 'e', title: 't' };
const questions: Question[] = [
  { answer: true, id: 'q-1', prompt: 'one', query, type: 'bool' },
  { answer: false, id: 'q-2', prompt: 'two', query, type: 'bool' },
];

describe('useQuizEngine', () => {
  it('ignores an answer that does not fit the current question', async () => {
    const mcQuestions: Question[] = [{ answerIndex: 0, choices: ['x', 'y', 'z'], id: 'q-mc', prompt: 'pick', query, type: 'mc' }];
    const { result } = await renderHook(() => useQuizEngine(mcQuestions));
    let outOfRange: boolean | null = true;
    let wrongKind: boolean | null = true;
    await act(async () => { outOfRange = result.current.submitAnswer(3); });
    await act(async () => { wrongKind = result.current.submitAnswer(true); });
    expect(outOfRange).toBeNull();
    expect(wrongKind).toBeNull();
    expect(result.current.isAnswered).toBe(false);
  });

  it('ignores a numeric answer to a boolean question', async () => {
    const { result } = await renderHook(() => useQuizEngine([questions[0]]));
    let answer: boolean | null = true;
    await act(async () => { answer = result.current.submitAnswer(1); });
    expect(answer).toBeNull();
    expect(result.current.isAnswered).toBe(false);
  });

  it('blocks advancing before an answer and ignores a second answer', async () => {
    const { result } = await renderHook(() => useQuizEngine(questions));
    await act(async () => result.current.advanceQuestion());
    expect(result.current.currentIndex).toBe(0);
    let firstResult: boolean | null = null;
    let secondResult: boolean | null = true;
    await act(async () => { firstResult = result.current.submitAnswer(true); });
    await act(async () => { secondResult = result.current.submitAnswer(false); });
    expect(firstResult).not.toBeNull();
    expect(secondResult).toBeNull();
    expect(result.current.submittedAnswer).toBe(true);
  });

  it('presents every question once, then completes', async () => {
    const { result } = await renderHook(() => useQuizEngine(questions));
    const seenIds: string[] = [];
    for (let step = 0; step < questions.length; step += 1) {
      seenIds.push(result.current.currentQuestion?.id ?? 'none');
      await act(async () => { result.current.submitAnswer(true); });
      await act(async () => result.current.advanceQuestion());
    }
    expect(seenIds.sort()).toEqual(['q-1', 'q-2']);
    expect(result.current.isComplete).toBe(true);
  });

  it('keeps the round unchanged when the bank changes mid-round', async () => {
    const { rerender, result } = await renderHook(({ bank }: { bank: Question[] }) => useQuizEngine(bank), {
      initialProps: { bank: questions },
    });
    const firstId = result.current.currentQuestion?.id;
    await act(async () => { result.current.submitAnswer(true); });
    await rerender({ bank: [{ answer: true, id: 'q-new', prompt: 'new', query, type: 'bool' }] });
    expect(result.current.currentQuestion?.id).toBe(firstId);
    expect(result.current.totalQuestions).toBe(2);
    expect(result.current.isAnswered).toBe(true);
  });
});
