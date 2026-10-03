// The two checkbox lines the owner edits, pre-filled from a kept decision.
import type { StoredDecision } from '../../types/review/StoredDecision.js';

export function renderDecisionLines(kept: StoredDecision | undefined): string[] {
    const { decision, reason } = kept ?? {};
    const isApproved = decision === 'approve';
    const isRejected = decision === 'reject';
    return [
        `- [${isApproved ? 'x' : ' '}] approve`,
        `- [${isRejected ? 'x' : ' '}] reject: ${isRejected ? (reason ?? '') : '<reason>'}`,
    ];
}
