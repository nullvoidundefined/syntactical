// True when a value is a well-formed question provenance record.
import { CONTENT_LIMITS } from './contentLimits.js';
import { isRecord } from './isRecord.js';

const SOURCES = ['original', 'generated'];
const METHODS = ['executed', 'judged'];
const STATUSES = ['pending', 'passed', 'failed'];

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string' && value.length <= CONTENT_LIMITS.displayFieldLength;
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
    STATUSES.includes(validation.status) &&
    typeof isHumanReviewed === 'boolean' &&
    isOptionalString(model) &&
    isOptionalString(promptVersion) &&
    isOptionalString(runtimeVersion)
  );
}
