// A short hash of everything the owner saw for an item. A decision only stands while the
// item still hashes the same; an edited question or new oracle output asks again.
import { createHash } from 'node:crypto';

import type { ReviewItem } from '../../types/review/ReviewItem.js';

const FINGERPRINT_LENGTH = 16;

export function fingerprintItem(item: ReviewItem): string {
    return createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, FINGERPRINT_LENGTH);
}
