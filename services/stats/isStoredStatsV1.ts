// Whether a value read from storage is well-formed v1 stats, the shape the
// v2 migration accepts.
import { isRecord } from '@syntactical/content-schema';

import { STATS_V1_SCHEMA_VERSION } from '../../constants/appConfig';

import { hasStatsCounts } from './hasStatsCounts';
import type { StatsV1 } from './types/StatsV1';

export function isStoredStatsV1(value: unknown): value is StatsV1 {
  return isRecord(value) && value.version === STATS_V1_SCHEMA_VERSION && hasStatsCounts(value, 'streak');
}
