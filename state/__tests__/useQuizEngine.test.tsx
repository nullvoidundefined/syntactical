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

  it('presents an A/B question, counts it, and scores it by its answer index', async () => {
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
    const { result } = await renderHook(() => useQuizEngine([abQuestion]));
    expect(result.current.currentQuestion?.id).toBe('q-ab');
    expect(result.current.totalQuestions).toBe(1);
    let outOfRange: boolean | null = true;
    let wrongKind: boolean | null = true;
    let verdict: boolean | null = null;
    await act(async () => { outOfRange = result.current.submitAnswer(2); });
    await act(async () => { wrongKind = result.current.submitAnswer(true); });
    expect([outOfRange, wrongKind]).toEqual([null, null]);
    await act(async () => { verdict = result.current.submitAnswer(1); });
    expect(verdict).toBe(false);
    expect(result.current.wasCorrect).toBe(false);
  });

  it('completes immediately when the bank holds no questions', async () => {
    const { result } = await renderHook(() => useQuizEngine([]));
    expect(result.current.currentQuestion).toBeNull();
    expect(result.current.totalQuestions).toBe(0);
  });

  it('starts a round of only the chosen topic', async () => {
    const bankWithTopics: Question[] = [
      ...['one', 'two'].map((id): Question => ({ answer: true, id: `s-${id}`, prompt: id, query, provenance: TEST_PROVENANCE, topic: 'strings', type: 'bool' })),
      ...['one', 'two', 'three'].map((id): Question => ({ answer: true, id: `n-${id}`, prompt: id, query, provenance: TEST_PROVENANCE, topic: 'numbers-and-math', type: 'bool' })),
      { answer: true, id: 'untopiced', prompt: 'none', query, provenance: TEST_PROVENANCE, type: 'bool' },
    ];
    const { result } = await renderHook(() => useQuizEngine(bankWithTopics, { topic: 'strings' }));
    expect(result.current.totalQuestions).toBe(2);
    const seen: string[] = [];
    for (let step = 0; step < 2; step += 1) {
      seen.push(result.current.currentQuestion?.id ?? '');
      await act(async () => { result.current.submitAnswer(true); });
      await act(async () => result.current.advanceQuestion());
    }
    expect(seen.sort()).toEqual(['s-one', 's-two']);
    expect(result.current.isComplete).toBe(true);
  });

  it('plays the whole bank when no topic is given', async () => {
    const bank: Question[] = [
      { answer: true, id: 'a', prompt: 'a', query, provenance: TEST_PROVENANCE, topic: 'strings', type: 'bool' },
      { answer: true, id: 'b', prompt: 'b', query, provenance: TEST_PROVENANCE, type: 'bool' },
    ];
    const { result } = await renderHook(() => useQuizEngine(bank));
    expect(result.current.totalQuestions).toBe(2);
  });
});
