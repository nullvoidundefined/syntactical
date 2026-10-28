// Request body for POST /v1/ask: the question being asked about (its bank key and id, the shape
// answer events use) and either the learner's message, with optionally the choice they picked, or
// { mode: 'explain' } with the choice they picked and no message ("Explain my mistake", whose
// instruction the server writes). Unknown fields are refused, so neither shape takes the other's
// fields. Whether the bank, question, and choice exist, and that an explained choice is wrong, is
// the route's check.
import { z } from 'zod';

import { ASK } from '../constants/ask.js';

const ID_MAX_LENGTH = 100;
const BANK_KEY_PATTERN = /^[a-z0-9-]+\/[a-z]+$/;

const target = {
  bankKey: z.string().max(ID_MAX_LENGTH).regex(BANK_KEY_PATTERN),
  questionId: z.string().min(1).max(ID_MAX_LENGTH),
};

const askSchemas = {
  create: z.union([
    z
      .object({
        ...target,
        choiceIndex: z.int().min(0).optional(),
        message: z.string().trim().min(1).max(ASK.MAX_QUESTION_LENGTH),
      })
      .strict(),
    z
      .object({
        ...target,
        choiceIndex: z.int().min(0),
        mode: z.literal('explain'),
      })
      .strict(),
  ]),
};

type AskCreate = z.infer<typeof askSchemas.create>;

export { askSchemas };
export type { AskCreate };
