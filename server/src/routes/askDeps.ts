// What POST /v1/ask needs from the caller of createApp. With no model provider (no
// ANTHROPIC_API_KEY) the route still checks the request, then answers 503. The clock defaults to
// the system clock in createApp.
import type { Database } from '../clients/database.js';
import type { ModelProvider } from '../clients/modelProvider.js';
import type { PaidBanks } from '../types/PaidBanks.js';
import type { QuestionIndex } from '../types/QuestionIndex.js';

interface AskDeps {
  database: Database;
  modelProvider?: ModelProvider;
  now?: () => Date;
  paidBanks: PaidBanks;
  questions: QuestionIndex;
  rateLimitKeySecret: string;
}

type ResolvedAskDeps = Omit<Required<AskDeps>, 'modelProvider'> & Pick<AskDeps, 'modelProvider'>;

export type { AskDeps, ResolvedAskDeps };
