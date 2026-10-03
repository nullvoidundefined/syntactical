// Inputs for classifying one bank (see classifyBank).
import type { Question } from '@syntactical/content-schema';

import type { ModelProvider } from './ModelProvider.js';

export interface ClassifyBankArgs {
    bankKey: string;
    difficulty: string;
    languageId: string;
    log: (line: string) => void;
    outRoot: string;
    provider: ModelProvider;
    questions: Question[];
    topics: string[];
}
