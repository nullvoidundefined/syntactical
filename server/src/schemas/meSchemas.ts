// Request body for PATCH /v1/me: a timezone the runtime knows as an IANA zone, a daily goal of
// 10, 20, or 50, or both. Unknown fields and an empty body are refused.
import { DAILY_GOALS } from '@syntactical/progress';
import { z } from 'zod';

import { isValidTimeZone } from '../services/isValidTimeZone.js';

// The longest IANA zone name is 32 characters; anything far longer is not a zone.
const TIMEZONE_MAX_LENGTH = 64;

const [CASUAL_GOAL, REGULAR_GOAL, SERIOUS_GOAL] = DAILY_GOALS;

const meSchemas = {
  update: z
    .object({
      dailyGoal: z.union([z.literal(CASUAL_GOAL), z.literal(REGULAR_GOAL), z.literal(SERIOUS_GOAL)]).optional(),
      timezone: z.string().max(TIMEZONE_MAX_LENGTH).refine(isValidTimeZone).optional(),
    })
    .strict()
    .refine(({ dailyGoal, timezone }) => dailyGoal !== undefined || timezone !== undefined),
};

type MeUpdate = z.infer<typeof meSchemas.update>;

export { meSchemas };
export type { MeUpdate };
