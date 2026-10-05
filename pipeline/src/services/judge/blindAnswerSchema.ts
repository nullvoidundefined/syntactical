// Blind answers must name a non-negative choice index.
import { z } from 'zod';
export const blindAnswerSchema = z.strictObject({ answerIndex: z.number().int().min(0) });
