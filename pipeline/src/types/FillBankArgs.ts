// What gap-filling one bank needs. `outRoot` is the public pipeline dir for a free bank and
// the private content root for a paid one.
import type { Question } from '@syntactical/content-schema';

import type { runOracle } from '../clients/dockerRunner.js';

import type { ModelProvider } from './ModelProvider.js';
import type { OracleLanguage } from './OracleLanguage.js';

export interface FillBankArgs {
    bankKey: string;
    difficulty: string;
    language: OracleLanguage;
    languageId: string;
    log: (line: string) => void;
    outRoot: string;
    provider: ModelProvider;
    questions: Question[];
    run?: typeof runOracle;
    topics: string[];
}
