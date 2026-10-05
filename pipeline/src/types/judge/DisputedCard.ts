// Retains the disagreement and verified evidence for an owner decision.
import type { Question } from '@syntactical/content-schema';
export interface DisputedCard {
    blindAnswers: { claude: number | null; codex: number | null };
    claimedIndex: number;
    consistency: { isConsistent: boolean; reason: string } | null;
    failure: 'blind-disagreement' | 'inconsistent';
    question: Question;
}
