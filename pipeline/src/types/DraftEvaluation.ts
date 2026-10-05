// The verdict on one drafted question: kept, dropped outright, or sent back for a revision
// with the feedback to show the model.
import type { Question } from '@syntactical/content-schema';
import type { Oracle } from './Oracle.js';

export type DraftEvaluation =
    | { feedback: string; status: 'revise' }
    | { oracle: Oracle; question: Question; status: 'kept' }
    | { reason: 'duplicate'; status: 'dropped' };
