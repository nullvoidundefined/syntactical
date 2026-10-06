import { sampleQuestions } from '../sampleQuestions';

const pool = Array.from({ length: 100 }, (_, index) => `q-${index}`);

function buildSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('sampleQuestions', () => {
  it('returns exactly the requested number of distinct items from the pool', () => {
    const sample = sampleQuestions(pool, 20, buildSeededRandom(1));
    expect(sample).toHaveLength(20);
    expect(new Set(sample).size).toBe(20);
    sample.forEach((item) => expect(pool).toContain(item));
  });

  it('is deterministic for a fixed random source and leaves the pool untouched', () => {
    const copy = [...pool];
    expect(sampleQuestions(pool, 50, buildSeededRandom(7))).toEqual(sampleQuestions(pool, 50, buildSeededRandom(7)));
    expect(pool).toEqual(copy);
  });

  it('draws a different sample from a different random source', () => {
    expect(sampleQuestions(pool, 20, buildSeededRandom(1))).not.toEqual(
      sampleQuestions(pool, 20, buildSeededRandom(2)),
    );
  });

  it('reaches every item of the pool across many draws (no position is excluded)', () => {
    const random = buildSeededRandom(3);
    const seen = new Set<string>();
    for (let draw = 0; draw < 200; draw += 1) sampleQuestions(pool, 20, random).forEach((item) => seen.add(item));
    expect(seen.size).toBe(pool.length);
  });

  it('returns the whole pool when the size is at or past it, and nothing for a size of zero or less', () => {
    expect([...sampleQuestions(pool, 100)].sort()).toEqual([...pool].sort());
    expect(sampleQuestions(pool, 500)).toHaveLength(100);
    expect(sampleQuestions(pool, 0)).toEqual([]);
    expect(sampleQuestions(pool, -3)).toEqual([]);
  });
});
