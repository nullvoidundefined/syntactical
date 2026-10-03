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
    // The free staging tree (public pipeline dir) or the private content root, per bank access.
    outRoot: string;
    reported: Map<string, PublishVerdict>;
    source: Question[];
}
