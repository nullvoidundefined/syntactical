// The inputs publishing one bank takes.
import type { BankContext, Question } from '@syntactical/content-schema';

import type { PublishVerdict } from './PublishVerdict.js';

export interface PublishBankArgs {
    bankFile: string;
    bankKey: string;
    context: BankContext;
    difficulty: string;
    languageId: string;
    log: (line: string) => void;
    // The staging tree: the pipeline dir, for every bank.
    outRoot: string;
    reported: Map<string, PublishVerdict>;
    source: Question[];
}
