// The length the server counts: Unicode code points after NFKC normalization.
// The value is never trimmed.
export function countPasswordLength(value: string): number {
  return Array.from(value.normalize('NFKC')).length;
}
