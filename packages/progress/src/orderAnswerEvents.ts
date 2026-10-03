// Answer events in replay order: by answeredAt instant, then eventId, with
// a repeated eventId kept once. Replays over this order do not depend on
// the order events arrived in.
import type { AnswerEvent } from './types/AnswerEvent.js';

function compareEvents(left: AnswerEvent, right: AnswerEvent): number {
    const { answeredAt: leftAt, eventId: leftId } = left;
    const { answeredAt: rightAt, eventId: rightId } = right;
    const byTime = Date.parse(leftAt) - Date.parse(rightAt);
    if (byTime !== 0) {
        return byTime;
    }
    if (leftId === rightId) {
        return 0;
    }
    return leftId < rightId ? -1 : 1;
}

export function orderAnswerEvents<T extends AnswerEvent>(events: readonly T[]): T[] {
    const seenEventIds = new Set<string>();
    return [...events].sort(compareEvents).filter(({ eventId }) => {
        if (seenEventIds.has(eventId)) {
            return false;
        }
        seenEventIds.add(eventId);
        return true;
    });
}
