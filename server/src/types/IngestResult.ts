import type { ProgressTotals } from './ProgressTotals.js';

type IngestResult =
  | { eventIds: string[]; kind: 'invalid-events' | 'timestamp-out-of-range' }
  | { kind: 'stored'; totals: ProgressTotals & { insertedCount: number } };

export type { IngestResult };
