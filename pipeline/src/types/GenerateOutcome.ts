// How one generated question ended: kept (validated by execution), or dropped.
import type { Question } from '@syntactical/content-schema';

export type GenerateOutcome =
    | { question: Question; status: 'kept' }
    | { reason: 'disallowed-runner' | 'duplicate' | 'generation-failed' | 'not-executable'; status: 'dropped' };
