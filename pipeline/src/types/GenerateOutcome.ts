// Execution or judging can keep a draft; disagreements are reviewable, other failures drop it.
import type { Question } from '@syntactical/content-schema';

import type { ProviderTransientReason } from './ProviderTransientError.js';
import type { DisputedCard } from './judge/DisputedCard.js';
import type { Oracle } from './Oracle.js';

export type GenerateOutcome =
    | { oracle?: Oracle; question: Question; status: 'kept' }
    | { card: DisputedCard; status: 'disputed' }
    | {
          reason:
              | 'source-unverified'
              | 'disallowed-runner'
              | 'duplicate'
              | 'generation-failed'
              | 'not-executable'
              | ProviderTransientReason;
          status: 'dropped';
      };
