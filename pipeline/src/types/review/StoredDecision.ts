// One entry of `review/decisions/<language>-<difficulty>.json`, which publish consumes.
// `provenance.isHumanReviewed` is true only for an approval.
export interface StoredDecision {
    decision: 'approve' | 'reject';
    fingerprint: string;
    provenance: { isHumanReviewed: boolean };
    reason?: string;
}
