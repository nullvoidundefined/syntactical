// True when a question carries a topic or misconceptionId that is present but
// not a string (null counts as present). Absent (undefined) is not malformed.
import { isRecord } from './isRecord.js';
import { listMisconceptionCarriers } from './listMisconceptionCarriers.js';

function isPresentNonString(value: unknown): boolean {
  return value !== undefined && typeof value !== 'string';
}

export function hasMalformedReference(question: Record<string, unknown>): boolean {
  if (isPresentNonString(question.topic)) return true;
  return listMisconceptionCarriers(question).some((carrier) => isRecord(carrier) && isPresentNonString(carrier.misconceptionId));
}
