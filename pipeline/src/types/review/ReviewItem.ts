// One thing the owner must look at in a bank's review file.
import type { Question } from '@syntactical/content-schema';

import type { EnrichedRationale } from '../EnrichedRationale.js';

export interface ReviewItem {
    id: string;
    kinds: string[];
    observed?: string;
    proposedTopic?: string;
    question?: Question;
    rationales?: EnrichedRationale[];
    status?: string;
}
