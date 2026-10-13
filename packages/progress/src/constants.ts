// XP per correct answer by bank difficulty, the bonus for a correct due
// review answer, the daily goals a learner can pick, and the one a learner
// starts with until they pick another.
export const XP_BY_DIFFICULTY = { easy: 1, hard: 3, medium: 2 } as const;

export const REVIEW_BONUS_XP = 1;

const CASUAL_DAILY_GOAL = 10;
const REGULAR_DAILY_GOAL = 20;
const SERIOUS_DAILY_GOAL = 50;

export const DAILY_GOALS = [CASUAL_DAILY_GOAL, REGULAR_DAILY_GOAL, SERIOUS_DAILY_GOAL] as const;

export const DEFAULT_DAILY_GOAL: (typeof DAILY_GOALS)[number] = REGULAR_DAILY_GOAL;
