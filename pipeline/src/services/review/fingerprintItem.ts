// A short hash of the content the owner judged: the question, the oracle output, the
// rationales, and the proposed topic. Why the item is listed (`kinds`) and its validation
// status are left out, so an item leaving the sample or the pending list keeps its
// decision. A decision only stands while this hash is unchanged.
import { createHash } from 'node:crypto';

import type { ReviewItem } from '../../types/review/ReviewItem.js';

const FINGERPRINT_LENGTH = 16;

export function fingerprintItem(item: ReviewItem): string {
    const { observed, proposedTopic, question, rationales } = item;
    const judged = { observed, proposedTopic, question, rationales };
    return createHash('sha256').update(JSON.stringify(judged)).digest('hex').slice(0, FINGERPRINT_LENGTH);
}
