// One item's decision as read back from a review file. `problem` is set when the item was
// malformed or a reject had no reason: such an item is `pending`, never guessed.
export interface ReviewDecision {
    decision: 'approve' | 'pending' | 'reject';
    fingerprint?: string;
    id: string;
    problem?: string;
    reason?: string;
}
