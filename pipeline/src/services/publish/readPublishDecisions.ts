// Reads `review/decisions/<language>-<difficulty>.json`, the file the review stage writes and
// publish consumes, as question id to `{ decision, isHumanReviewed }`. The review stage's own
// reader does the parsing: a missing file means no decisions, and a file that does not match the
// shape throws, so a bad file never silently turns reviewed questions into unreviewed ones.
import { join } from 'node:path';

import type { PublishDecision } from '../../types/publish/PublishDecision.js';
import { readStoredDecisions } from '../review/readStoredDecisions.js';

export async function readPublishDecisions(
    outRoot: string,
    languageId: string,
    difficulty: string,
): Promise<Map<string, PublishDecision>> {
    const stored = await readStoredDecisions(join(outRoot, 'review', 'decisions', `${languageId}-${difficulty}.json`));
    return new Map(
        Object.entries(stored).map(([id, { decision, provenance }]) => [
            id,
            { decision, isHumanReviewed: provenance.isHumanReviewed },
        ]),
    );
}
