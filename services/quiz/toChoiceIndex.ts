// The choice index an answer event records: the index itself for a
// multiple choice answer, and for a true/false answer its position on the
// card, which shows True first (True is 0, False is 1).
export function toChoiceIndex(value: number | boolean): number {
  if (typeof value === 'number') return value;
  return value ? 0 : 1;
}
