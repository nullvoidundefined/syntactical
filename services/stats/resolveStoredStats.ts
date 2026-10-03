// Turns the raw stored stats into the stats to start from. Valid v2 stats
// load as they are; v1 stats migrate in memory and are written as v2 with
// the first change, so rerunning the migration is harmless. A migration
// that throws backs the v1 value up, leaves it in place, and keeps changes
// in memory. Any other value is backed up and replaced by empty stats, with
// changes kept in memory when that backup cannot be written.
import { logWarning } from '../../clients/logClient';
import { writeJson } from '../../clients/writeJson';
import { REJECTED_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';

import { createEmptyStats } from './createEmptyStats';
import { isStoredStats } from './isStoredStats';
import { isStoredStatsV1 } from './isStoredStatsV1';
import { migrateStatsV1 } from './migrateStatsV1';
import type { Stats } from './types/Stats';
import type { StatsV1 } from './types/StatsV1';

type ResolvedStats = { isPersistenceBlocked: boolean; stats: Stats };

const LOG_CONTEXT = { backupKey: REJECTED_STORAGE_KEY, key: STORAGE_KEY };

async function migrateOrKeepV1(stored: StatsV1, today: string): Promise<ResolvedStats> {
  try {
    return { isPersistenceBlocked: false, stats: migrateStatsV1(stored, today) };
  } catch (err) {
    logWarning({ ...LOG_CONTEXT, err }, 'stored stats migration failed');
    await writeJson(REJECTED_STORAGE_KEY, stored);
    return { isPersistenceBlocked: true, stats: createEmptyStats(today) };
  }
}

export async function resolveStoredStats(raw: unknown, today: string): Promise<ResolvedStats> {
  if (raw === null) return { isPersistenceBlocked: false, stats: createEmptyStats(today) };
  if (isStoredStats(raw)) return { isPersistenceBlocked: false, stats: raw };
  if (isStoredStatsV1(raw)) return migrateOrKeepV1(raw, today);
  logWarning(LOG_CONTEXT, 'stored stats rejected');
  const isBackedUp = await writeJson(REJECTED_STORAGE_KEY, raw);
  if (!isBackedUp) logWarning(LOG_CONTEXT, 'stored stats backup failed, keeping changes in memory');
  return { isPersistenceBlocked: !isBackedUp, stats: createEmptyStats(today) };
}
