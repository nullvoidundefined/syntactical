// XP for one answer event: the bank difficulty's XP for a correct answer,
// plus the review bonus when it was a due review, and 0 for a wrong answer.
// The difficulty is the second segment of the bank key (`python/hard`); a
// wrong answer earns 0 before the key is read, and a correct answer with a
// malformed key throws (ingestion rejects such events).
import { REVIEW_BONUS_XP, XP_BY_DIFFICULTY } from './constants.js';
import type { AnswerEvent } from './types/AnswerEvent.js';

type Difficulty = keyof typeof XP_BY_DIFFICULTY;

const BANK_KEY_SEGMENT_COUNT = 2;

function isDifficulty(value: string): value is Difficulty {
    return Object.hasOwn(XP_BY_DIFFICULTY, value);
}

function readDifficulty(bankKey: string): Difficulty {
    const segments = bankKey.split('/');
    const [language, difficulty] = segments;
    if (
        segments.length !== BANK_KEY_SEGMENT_COUNT ||
        !language ||
        difficulty === undefined ||
        !isDifficulty(difficulty)
    ) {
        throw new RangeError(`Bank key has no known difficulty: ${bankKey}`);
    }
    return difficulty;
}

export function computeXp(event: AnswerEvent, isDueReview: boolean): number {
    const { bankKey, isCorrect } = event;
    if (!isCorrect) {
        return 0;
    }
    return XP_BY_DIFFICULTY[readDifficulty(bankKey)] + (isDueReview ? REVIEW_BONUS_XP : 0);
}
