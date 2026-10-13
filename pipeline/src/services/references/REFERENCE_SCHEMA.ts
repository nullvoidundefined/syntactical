// The shape of one model-written reference, within the content limits for a query: a title, the
// syntax reference, and one to maxDocLinks https documentation links.
import { CONTENT_LIMITS } from '@syntactical/content-schema';
import { z } from 'zod';

export const REFERENCE_SCHEMA = z.object({
    docs: z
        .array(
            z.object({
                title: z.string().trim().min(1).max(CONTENT_LIMITS.displayFieldLength),
                url: z
                    .string()
                    .max(CONTENT_LIMITS.sourceUrlLength)
                    .regex(/^https:\/\/\S+$/),
            }),
        )
        .min(1)
        .max(CONTENT_LIMITS.maxDocLinks),
    syntax: z.string().trim().min(1).max(CONTENT_LIMITS.longTextLength),
    title: z.string().trim().min(1).max(CONTENT_LIMITS.queryTitleLength),
});
