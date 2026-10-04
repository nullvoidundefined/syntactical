// Turns the stored stats read into the stats to start from. A read that
// failed starts empty with changes kept in memory, so a transient storage
// error never overwrites what is stored. Valid v2 stats load as they are;
// v1 stats migrate in memory and are written as v2 with the first change, so
// rerunning the migration is harmless. Any other value starts empty and is
// replaced by the first change.
import type { StoredRead } from '../../clients/types/StoredRead';

import { createEmptyStats } from './createEmptyStats';
import { isStoredStats } from './isStoredStats';
import { isStoredStatsV1 } from './isStoredStatsV1';
import { migrateStatsV1 } from './migrateStatsV1';
import type { Stats } from './types/Stats';

type ResolvedStats = { isPersistenceBlocked: boolean; stats: Stats };

export function resolveStoredStats(read: StoredRead, today: string): ResolvedStats {
  const { isReadFailed, value: raw } = read;
  if (isReadFailed) return { isPersistenceBlocked: true, stats: createEmptyStats(today) };
  if (isStoredStats(raw)) return { isPersistenceBlocked: false, stats: raw };
  if (isStoredStatsV1(raw)) return { isPersistenceBlocked: false, stats: migrateStatsV1(raw, today) };
  return { isPersistenceBlocked: false, stats: createEmptyStats(today) };
}
