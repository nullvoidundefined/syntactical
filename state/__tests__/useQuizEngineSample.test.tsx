import type { Question } from '@syntactical/content-schema';
import { act, renderHook } from '@testing-library/react-native';

import { TEST_PROVENANCE } from '../../services/content/__tests__/fixtures/contentFixtures';
import { useQuizEngine } from '../useQuizEngine';

const query = { explanation: 'e', title: 't' };
const pool: Question[] = Array.from({ length: 100 }, (_, index) => ({
  answer: true,
  id: `q-${index}`,
  prompt: `p${index}`,
  provenance: TEST_PROVENANCE,
  query,
  topic: index < 30 ? 'a' : 'b',
  type: 'bool',
}));

async function playRound(sampleSize: number | undefined, topic?: string) {
  const { result } = await renderHook(() => useQuizEngine(pool, { sampleSize, topic }));
  const ids: string[] = [];
  while (!result.current.isComplete) {
    ids.push(result.current.currentQuestion?.id ?? '');
    await act(async () => {
      result.current.submitAnswer(true);
    });
    await act(async () => result.current.advanceQuestion());
  }
  return { ids, result };
}

describe('useQuizEngine with a sample size', () => {
  it('plays exactly that many distinct questions from the pool and scores out of that many', async () => {
    const { ids, result } = await playRound(20);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    ids.forEach((id) => expect(pool.map((question) => question.id)).toContain(id));
    expect(result.current.totalQuestions).toBe(20);
    expect(result.current.correctCount).toBe(20);
    expect(result.current.accuracy).toBe(100);
  });

  it('samples from the topic pool when a topic is set', async () => {
    const { ids } = await playRound(20, 'a');
    expect(ids).toHaveLength(20);
    ids.forEach((id) => expect(Number(id.slice(2))).toBeLessThan(30));
  });

  it('plays the whole pool when the size is not smaller than it', async () => {
    expect((await playRound(undefined)).ids).toHaveLength(100);
    expect((await playRound(100)).ids).toHaveLength(100);
    expect((await playRound(20, 'a')).ids).toHaveLength(20);
  });
});
