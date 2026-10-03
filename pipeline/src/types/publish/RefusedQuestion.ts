// A question publish would not write, with the closed reason it was refused.
export interface RefusedQuestion {
    id: string;
    reason: 'rejected' | 'unvalidated-unreviewed' | 'validation-failed';
}
