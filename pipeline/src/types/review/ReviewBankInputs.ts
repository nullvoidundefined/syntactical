// What the earlier stages staged for one bank, read from `<outRoot>/...` by readBankInputs.
import type { Question } from '@syntactical/content-schema';

import type { EnrichedRationale } from '../EnrichedRationale.js';

export interface ReviewBankInputs {
    classifications: Record<string, { topic: string }>;
    enrichment: Record<string, EnrichedRationale[]>;
    generated: Question[];
    queue: { id: string; reason?: string; suggestedTopic?: string }[];
}
