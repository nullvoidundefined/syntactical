import type { ProgressTotals } from './ProgressTotals.js';

type IngestResult =
  | { eventIds: string[]; kind: 'invalid-events' | 'timestamp-out-of-range' }
  | { kind: 'event-cap-reached' }
  | { kind: 'stored'; totals: ProgressTotals & { insertedCount: number } };

export type { IngestResult };
