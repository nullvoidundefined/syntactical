// True for a non-empty string no longer than the limit.
export function isTextWithin(value: unknown, limit: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= limit;
}
