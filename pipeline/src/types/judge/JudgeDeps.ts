// Keeps model and source transports injectable while the judge owns the decision.
import type { SourceFetcher } from '../../clients/sourceFetcher.js';
import type { ModelProvider } from '../ModelProvider.js';
export interface JudgeDeps {
    claude: ModelProvider;
    codex: ModelProvider;
    fetchSource: SourceFetcher;
}
