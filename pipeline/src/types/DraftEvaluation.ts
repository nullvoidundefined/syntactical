// The verdict on one drafted question: kept, dropped outright, or sent back for a revision
// with the feedback to show the model.
import type { Question } from '@syntactical/content-schema';

export type DraftEvaluation =
    | { feedback: string; status: 'revise' }
    | { question: Question; status: 'kept' }
    | { reason: 'duplicate'; status: 'dropped' };
