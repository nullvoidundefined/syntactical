import type { Question } from '@syntactical/content-schema';
import { act, renderHook } from '@testing-library/react-native';

import { useQuizEngine } from '../useQuizEngine';
import { TEST_PROVENANCE } from '../../services/content/__tests__/fixtures/contentFixtures';

const query = { explanation: 'e', title: 't' };
const questions: Question[] = [
  { answer: true, id: 'q-1', prompt: 'one', query, provenance: TEST_PROVENANCE, type: 'bool' },
  { answer: false, id: 'q-2', prompt: 'two', query, provenance: TEST_PROVENANCE, type: 'bool' },
];

describe('useQuizEngine', () => {
  it('ignores an answer that does not fit the current question', async () => {
    const mcQuestions: Question[] = [{ answerIndex: 0, choices: [{ text: 'x' }, { text: 'y' }, { text: 'z' }], id: 'q-mc', prompt: 'pick', query, provenance: TEST_PROVENANCE, type: 'mc' }];
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
    await rerender({ bank: [{ answer: true, id: 'q-new', prompt: 'new', query, provenance: TEST_PROVENANCE, type: 'bool' }] });
    expect(result.current.currentQuestion?.id).toBe(firstId);
    expect(result.current.totalQuestions).toBe(2);
    expect(result.current.isAnswered).toBe(true);
  });

  it('never presents an A/B question and counts only the playable ones', async () => {
    const abQuestion = {
      answerIndex: 0,
      choices: [{ text: 'fast' }, { text: 'slow' }],
      criterion: { evidence: 'e', statement: 's', type: 'performance' },
      id: 'q-ab',
      prompt: 'Which is optimal?',
      provenance: TEST_PROVENANCE,
      query,
      type: 'ab',
    } as Question;
    const { result } = await renderHook(() => useQuizEngine([abQuestion, ...questions]));
    const seenIds: string[] = [];
    while (!result.current.isComplete) {
      seenIds.push(result.current.currentQuestion!.id);
      await act(async () => { result.current.submitAnswer(true); });
      await act(async () => { result.current.advanceQuestion(); });
    }
    expect(seenIds.sort()).toEqual(['q-1', 'q-2']);
    expect(result.current.totalQuestions).toBe(2);
  });

  it('completes immediately when a bank holds only A/B questions', async () => {
    const onlyAb = [{ answerIndex: 0, choices: [{ text: 'a' }, { text: 'b' }], criterion: { evidence: 'e', statement: 's', type: 'performance' }, id: 'q-ab', prompt: 'p', provenance: TEST_PROVENANCE, query, type: 'ab' }] as Question[];
    const { result } = await renderHook(() => useQuizEngine(onlyAb));
    expect(result.current.currentQuestion).toBeNull();
    expect(result.current.totalQuestions).toBe(0);
  });
});
