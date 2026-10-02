// A fresh stats object with every counter at zero.
import { STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';

import type { Stats } from './types/Stats';

export function createEmptyStats(): Stats {
  return {
    streak: { best: 0, current: 0 },
    totals: { attempted: 0, correct: 0 },
    tracks: {},
    version: STORAGE_SCHEMA_VERSION,
  };
}
