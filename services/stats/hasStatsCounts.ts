// Whether a value holds the counters every stats schema shares: an answer
// streak under the given field, totals, and well-formed tracks.
import { isRecord } from '@syntactical/content-schema';

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasCounts(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && keys.every((key) => isCount(value[key]));
}

function areValidTracks(tracks: unknown): boolean {
  if (!isRecord(tracks)) return false;
  return Object.values(tracks).every((entry) => hasCounts(entry, ['attempted', 'correct', 'completions']));
}

export function hasStatsCounts(value: Record<string, unknown>, streakField: 'answerStreak' | 'streak'): boolean {
  const { totals, tracks } = value;
  return hasCounts(value[streakField], ['current', 'best']) && hasCounts(totals, ['attempted', 'correct']) && areValidTracks(tracks);
}
