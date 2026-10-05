// Bounds the explanation retained as evidence.
import { CONTENT_LIMITS } from '@syntactical/content-schema';
import { z } from 'zod';
export const consistencySchema = z.strictObject({
    isConsistent: z.boolean(),
    reason: z.string().min(1).max(CONTENT_LIMITS.longTextLength),
});
