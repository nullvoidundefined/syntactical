// Picks the deterministic review sample of a bank's executed questions: 10% (rounded up),
// at least 3 (or all of them when fewer). Ids are ranked by a hash seeded with the bank
// key, so a rerun picks the same ones and other banks pick independently.
import { createHash } from 'node:crypto';

const SAMPLE_FRACTION = 0.1;
const SAMPLE_MINIMUM = 3;

export function pickSample(bankKey: string, ids: string[]): string[] {
    const size = Math.min(ids.length, Math.max(SAMPLE_MINIMUM, Math.ceil(ids.length * SAMPLE_FRACTION)));
    return ids
        .map((id) => ({ id, rank: createHash('sha256').update(`${bankKey}:${id}`).digest('hex') }))
        .sort((left, right) => (left.rank < right.rank ? -1 : 1))
        .slice(0, size)
        .map(({ id }) => id);
}
