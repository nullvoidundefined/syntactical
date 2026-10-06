// The round-length rules: which fixed lengths a pool offers, and which `count` route value a
// round honors. A fixed length applies only when it is smaller than the pool. A pool whose size
// the manifest does not give (undefined) offers every fixed length; the round itself plays the
// whole pool when the length is not smaller than it.
import { ROUND_LENGTHS } from '../../constants/appConfig';

export function listRoundLengths(poolSize: number | undefined): number[] {
  if (poolSize === undefined) return [...ROUND_LENGTHS];
  return ROUND_LENGTHS.filter((length) => length < poolSize);
}

// A pool that offers no fixed length skips the length step.
export function isLengthChoiceOffered(poolSize: number | undefined): boolean {
  return listRoundLengths(poolSize).length > 0;
}

// The sample size a `count` route param asks for, or undefined (play the whole pool) when it is
// missing, malformed, an array, not a listed length, or not smaller than the pool.
export function readRoundCount(raw: string | string[] | undefined, poolSize: number): number | undefined {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
  const count = Number(raw);
  return listRoundLengths(poolSize).find((length) => length === count);
}

// The question count of a whole bank or one topic of it, from the manifest's topic counts, or
// undefined when the manifest gives none for it.
export function readPoolSize(topicCounts: Record<string, number>, topic: string | undefined): number | undefined {
  const size =
    topic === undefined ? Object.values(topicCounts).reduce((sum, count) => sum + count, 0) : (topicCounts[topic] ?? 0);
  return size > 0 ? size : undefined;
}
