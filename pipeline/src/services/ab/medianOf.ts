// The median of a non-empty list: the middle value, or the mean of the two middle values.
const PAIR = 2;

export function medianOf(values: readonly number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / PAIR);
    const high = sorted[middle] as number;
    const low = sorted[middle - 1] as number;
    return sorted.length % PAIR === 1 ? high : (low + high) / PAIR;
}
