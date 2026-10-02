// True when a value is a well-formed question provenance record.
import { isRecord } from './isRecord.js';

const SOURCES = ['original', 'generated'];
const METHODS = ['executed', 'judged'];

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function isValidProvenance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { isHumanReviewed, model, promptVersion, runtimeVersion, source, validation } = value;
  return (
    typeof source === 'string' &&
    SOURCES.includes(source) &&
    isRecord(validation) &&
    typeof validation.method === 'string' &&
    METHODS.includes(validation.method) &&
    typeof validation.status === 'string' &&
    typeof isHumanReviewed === 'boolean' &&
    isOptionalString(model) &&
    isOptionalString(promptVersion) &&
    isOptionalString(runtimeVersion)
  );
}
