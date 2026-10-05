// Source failures are dropped; model disagreement remains reviewable.
import type { Question } from '@syntactical/content-schema';
import type { DisputedCard } from './DisputedCard.js';
export type JudgeOutcome =
    | { question: Question; status: 'judged' }
    | { card: DisputedCard; status: 'disputed' }
    | { reason: 'source-unverified'; status: 'dropped' };
