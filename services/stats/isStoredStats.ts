// Whether a value read from storage has the full stats shape and the
// current schema version. A value that
// parses as JSON but is malformed (null, {}, a partial object) would crash
// the first answer, so the provider falls back to empty stats instead.
import { STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';
import { isRecord } from '../content/isRecord';

import type { Stats } from './types/Stats';

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

export function isStoredStats(value: unknown): value is Stats {
  if (!isRecord(value)) return false;
  const { streak, totals, tracks, version } = value;
  return (
    version === STORAGE_SCHEMA_VERSION &&
    hasCounts(streak, ['current', 'best']) &&
    hasCounts(totals, ['attempted', 'correct']) &&
    areValidTracks(tracks)
  );
}
