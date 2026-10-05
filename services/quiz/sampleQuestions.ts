import { shuffleQuestions } from './shuffleQuestions';

// Returns `size` distinct items drawn uniformly at random from the pool (a Fisher-Yates
// shuffle, then the first `size`). A size at or past the pool returns the whole pool shuffled.
// The random source is injectable for tests.
export function sampleQuestions<T>(pool: readonly T[], size: number, random: () => number = Math.random): T[] {
  return shuffleQuestions(pool, random).slice(0, Math.max(0, size));
}
