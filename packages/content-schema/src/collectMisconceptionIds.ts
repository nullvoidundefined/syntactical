// Every misconceptionId a question carries: any mc choice (the correct one
// included) or the bool question itself. Absent ids are skipped.
import { isRecord } from './isRecord.js';
import { listMisconceptionCarriers } from './listMisconceptionCarriers.js';

export function collectMisconceptionIds(question: Record<string, unknown>): string[] {
  return listMisconceptionCarriers(question).flatMap((carrier) =>
    isRecord(carrier) && typeof carrier.misconceptionId === 'string' ? [carrier.misconceptionId] : [],
  );
}
