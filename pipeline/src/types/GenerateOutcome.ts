// How one generated question ended: kept (validated by execution), or dropped.
import type { Question } from '@syntactical/content-schema';

import type { ProviderTransientReason } from './ProviderTransientError.js';
import type { Oracle } from './Oracle.js';

export type GenerateOutcome =
    | { oracle: Oracle; question: Question; status: 'kept' }
    | {
          reason: 'disallowed-runner' | 'duplicate' | 'generation-failed' | 'not-executable' | ProviderTransientReason;
          status: 'dropped';
      };
