// Decides which decision stands for each current item. The review file the owner just
// edited is authoritative for an item whose fingerprint still matches and whose section
// parsed cleanly (so unticking a box revokes a decision). Otherwise the stored decision
// stands, if its fingerprint still matches. A decision whose listed item changed is dropped
// (pending again); one whose item is no longer listed is kept. Problems found in the file
// are returned for the caller to report.
import type { ReviewDecision } from '../../types/review/ReviewDecision.js';
import type { StoredDecision } from '../../types/review/StoredDecision.js';

interface MergedDecisions {
    kept: Map<string, StoredDecision>;
    problems: string[];
}

export function mergeDecisions(
    fingerprints: Map<string, string>,
    fromMarkdown: ReviewDecision[],
    stored: Record<string, StoredDecision>,
): MergedDecisions {
    const kept = new Map<string, StoredDecision>();
    const problems: string[] = [];
    const parsed = new Map<string, ReviewDecision>();
    for (const entry of fromMarkdown) {
        const { id, problem } = entry;
        if (problem !== undefined) {
            problems.push(`${id}: ${problem}`);
        }
        if (!parsed.has(id)) {
            parsed.set(id, entry);
        }
    }
    for (const [id, fingerprint] of fingerprints) {
        const edited = parsed.get(id);
        const { decision, fingerprint: seenFingerprint, problem, reason } = edited ?? {};
        if (decision !== undefined && problem === undefined && seenFingerprint === fingerprint) {
            if (decision !== 'pending') {
                kept.set(id, {
                    decision,
                    fingerprint,
                    provenance: { isHumanReviewed: decision === 'approve' },
                    ...(reason === undefined ? {} : { reason }),
                });
            }
            continue;
        }
        const earlier = Object.hasOwn(stored, id) ? stored[id] : undefined;
        if (earlier?.fingerprint === fingerprint) {
            kept.set(id, earlier);
        }
    }
    // An item no longer listed (left the sample, stopped being pending) keeps its decision:
    // only a change to the judged content of a listed item prunes one.
    for (const [id, earlier] of Object.entries(stored)) {
        if (!fingerprints.has(id)) {
            kept.set(id, earlier);
        }
    }
    return { kept, problems };
}
