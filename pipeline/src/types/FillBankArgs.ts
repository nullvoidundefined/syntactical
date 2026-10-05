// What gap-filling one bank needs. `outRoot` is the public pipeline dir for a free bank and
// the private content root for a paid one.
// `runners` marks a topic track; language tracks carry a single `language`.
import type { Question } from '@syntactical/content-schema';

import type { runOracle } from '../clients/dockerRunner.js';

import type { ModelProvider } from './ModelProvider.js';
import type { OracleLanguage } from './OracleLanguage.js';

interface FillBankBase {
    bankKey: string;
    difficulty: string;
    languageId: string;
    log: (line: string) => void;
    outRoot: string;
    provider: ModelProvider;
    questions: Question[];
    run?: typeof runOracle;
    topics: string[];
}

export type FillBankArgs = FillBankBase &
    ({ language: OracleLanguage; runners?: undefined } | { language?: undefined; runners: readonly OracleLanguage[] });
