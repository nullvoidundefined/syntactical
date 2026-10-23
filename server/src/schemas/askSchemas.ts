// Request body for POST /v1/ask: the question being asked about (its bank key and id, the shape
// answer events use), the learner's message, and optionally the choice they picked. Unknown
// fields are refused. Whether the bank, question, and choice exist is the route's check.
import { z } from 'zod';

import { ASK } from '../constants/ask.js';

const ID_MAX_LENGTH = 100;
const BANK_KEY_PATTERN = /^[a-z0-9-]+\/[a-z]+$/;

const askSchemas = {
  create: z
    .object({
      bankKey: z.string().max(ID_MAX_LENGTH).regex(BANK_KEY_PATTERN),
      choiceIndex: z.int().min(0).optional(),
      message: z.string().trim().min(1).max(ASK.MAX_QUESTION_LENGTH),
      questionId: z.string().min(1).max(ID_MAX_LENGTH),
    })
    .strict(),
};

type AskCreate = z.infer<typeof askSchemas.create>;

export { askSchemas };
export type { AskCreate };
