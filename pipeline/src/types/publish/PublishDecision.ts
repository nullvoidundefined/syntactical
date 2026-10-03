// One owner decision on a question, as publish reads it from
// `review/decisions/<language>-<difficulty>.json`. `isHumanReviewed` is true only for an approval.
export interface PublishDecision {
    decision: 'approve' | 'reject';
    isHumanReviewed: boolean;
}
