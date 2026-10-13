// Counts dropped batches in a row across a gap-fill run. One streak is shared by every bank
// of a run; a batch the provider answered resets it. fillBank throws ProviderFailureStop
// when recordFailure reports the cap, so the bank's tallies travel with the stop.
import { MAX_CONSECUTIVE_PROVIDER_FAILURES } from './MAX_CONSECUTIVE_PROVIDER_FAILURES.js';

export interface ProviderFailureStreak {
    // Records one dropped batch and returns the streak length when it reached the cap, else null.
    recordFailure(): number | null;
    recordSuccess(): void;
}

export function createProviderFailureStreak(max = MAX_CONSECUTIVE_PROVIDER_FAILURES): ProviderFailureStreak {
    let streak = 0;
    return {
        recordFailure() {
            streak += 1;
            return streak >= max ? streak : null;
        },
        recordSuccess() {
            streak = 0;
        },
    };
}
