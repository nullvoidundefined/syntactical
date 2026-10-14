// Inputs for enriching one bank (see enrichBank).
import type { Question } from '@syntactical/content-schema';

import type { ModelProvider } from './ModelProvider.js';
import type { TaxonomyEntry } from './TaxonomyEntry.js';

export interface EnrichBankArgs {
    bankKey: string;
    difficulty: string;
    languageId: string;
    log: (line: string) => void;
    // The recorded oracle output for a question, or undefined when it has none to condition on.
    observe: (question: Question) => Promise<string | undefined>;
    outRoot: string;
    provider: ModelProvider;
    questions: Question[];
    // A judge on a different model. With it, a question without an oracle observation is enriched
    // from its answer key and explanation, and both judges must accept each rationale; without
    // it, such a question is skipped.
    secondProvider?: ModelProvider;
    taxonomy: TaxonomyEntry[];
}
