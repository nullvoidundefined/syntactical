// What generating one question needs. `existingPrompts` holds normalized prompts; `run`
// defaults to the sandboxed `runOracle` and is only a seam for tests.
import type { runOracle } from '../clients/dockerRunner.js';

import type { ModelProvider } from './ModelProvider.js';
import type { OracleLanguage } from './OracleLanguage.js';

export interface GenerateQuestionArgs {
    difficulty: string;
    existingPrompts: ReadonlySet<string>;
    language: OracleLanguage;
    languageId: string;
    provider: ModelProvider;
    run?: typeof runOracle;
    topic: string;
}
