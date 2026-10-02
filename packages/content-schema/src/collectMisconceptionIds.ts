// Every misconceptionId a question carries: any mc choice (the correct one
// included) or the bool question itself. Absent ids are skipped.
import { isRecord } from './isRecord.js';

export function collectMisconceptionIds(question: Record<string, unknown>): string[] {
  const carriers: unknown[] =
    question.type === 'bool' ? [question] : Array.isArray(question.choices) ? question.choices : [];
  return carriers.flatMap((carrier) =>
    isRecord(carrier) && typeof carrier.misconceptionId === 'string' ? [carrier.misconceptionId] : [],
  );
}
