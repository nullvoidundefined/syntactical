// What generating one topic-track question needs. `runners` is the track's TRACK_RUNNERS entry;
// `run` defaults to the sandboxed `runOracle` and is only a seam for tests.
import type { runOracle } from '../clients/dockerRunner.js';

import type { JudgeDeps } from './judge/JudgeDeps.js';
import type { ModelProvider } from './ModelProvider.js';
import type { OracleLanguage } from './OracleLanguage.js';

export interface GenerateTopicQuestionArgs {
    judge?: JudgeDeps;
    difficulty: string;
    existingPrompts: ReadonlySet<string>;
    languageId: string;
    provider: ModelProvider;
    run?: typeof runOracle;
    runners: readonly OracleLanguage[];
    topic: string;
}
