// What gap-filling one bank needs. `outRoot` is the staging tree: the pipeline dir, for every bank.
// `runners` marks a topic track; language tracks carry a single `language`.
import type { Question } from '@syntactical/content-schema';

import type { runOracle } from '../clients/dockerRunner.js';
import type { ProviderFailureStreak } from '../services/gapFill/createProviderFailureStreak.js';

import type { ModelProvider } from './ModelProvider.js';
import type { OracleLanguage } from './OracleLanguage.js';

interface FillBankBase {
    bankKey: string;
    difficulty: string;
    // The run's shared streak of dropped batches; a bank filled on its own gets a fresh one.
    failures?: ProviderFailureStreak;
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
