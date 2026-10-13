// Counts dropped batches in a row across a gap-fill run and stops the run at the cap. One
// streak is shared by every bank of a run; a batch the provider answered resets it.
import { MAX_CONSECUTIVE_PROVIDER_FAILURES } from './MAX_CONSECUTIVE_PROVIDER_FAILURES.js';

export interface ProviderFailureStreak {
    // Records one dropped batch; throws when the streak reaches the cap.
    recordFailure(bankKey: string, topic: string): void;
    recordSuccess(): void;
}

export function createProviderFailureStreak(max = MAX_CONSECUTIVE_PROVIDER_FAILURES): ProviderFailureStreak {
    let streak = 0;
    return {
        recordFailure(bankKey, topic) {
            streak += 1;
            if (streak >= max) {
                throw new Error(`${bankKey} ${topic}: stopping after ${streak} consecutive dropped batches`);
            }
        },
        recordSuccess() {
            streak = 0;
        },
    };
}
