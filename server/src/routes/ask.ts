// POST /v1/ask: answers a learner's follow-up question about one quiz question, using Claude
// with the question, its answer key, and its explanation as context. Only for a user with any
// granted entitlement (area 3 replaces this gate with the Pro tier's limits); every bank is free,
// so no bank needs its own entitlement. Each user gets ASK.DAILY_LIMIT answers per UTC day,
// counting only answers given, under a per-minute burst limit.
//
// Order: session (401), burst limit (429), body (400), question lookup (404), entitlement (403),
// model configured (503), daily limit (429 ASK_DAILY_LIMIT_REACHED), model call (503
// ASK_UNAVAILABLE on failure or decline, with the answer handed back). Answers
// { data: { answer, remaining } }. The learner's message is never logged.
import { Router } from 'express';
import type { Logger } from 'pino';

import { ASK } from '../constants/ask.js';
import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfUser } from '../middleware/rateLimitKeys.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { askSchemas } from '../schemas/askSchemas.js';
import { buildAskPrompt } from '../services/buildAskPrompt.js';
import { hasAnyEntitlement } from '../services/hasAnyEntitlement.js';
import { releaseAskUsage } from '../services/releaseAskUsage.js';
import { reserveAskUsage } from '../services/reserveAskUsage.js';

import type { ResolvedAskDeps } from './askDeps.js';

const {
  STATUS: { BAD_REQUEST, FORBIDDEN, NOT_FOUND, OK, SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS },
} = HTTP;

const BOOL_CHOICE_COUNT = 2;

function toUsageDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function createAskRouter(deps: ResolvedAskDeps, logger: Logger): Router {
  const { database, modelProvider, now, questions, rateLimitKeySecret } = deps;
  const router = Router();
  const requireSession = createRequireSession({ database, now });
  const perUser = createRateLimit({
    database,
    keyOf: keyOfUser,
    keySecret: rateLimitKeySecret,
    limit: ASK.RATE_LIMIT.PER_USER,
    now,
    scope: ASK.RATE_LIMIT_SCOPE,
    windowMs: ASK.RATE_LIMIT.WINDOW_MS,
  });

  router.post('/ask', requireSession, perUser, async (req, res) => {
    const { session } = res.locals as { session: { userId: string } };
    const { userId } = session;
    const { data, success } = askSchemas.create.safeParse(req.body);
    if (!success) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
      return;
    }
    const { bankKey, choiceIndex, message, questionId } = data;
    const question = questions.get(bankKey)?.get(questionId);
    if (!question) {
      sendError(res, NOT_FOUND, ERROR_CODES.ROUTING.NOT_FOUND, 'Not found');
      return;
    }
    const choiceCount = question.type === 'bool' ? BOOL_CHOICE_COUNT : question.choices.length;
    if (choiceIndex !== undefined && choiceIndex >= choiceCount) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
      return;
    }
    if (!(await hasAnyEntitlement(database, userId))) {
      sendError(res, FORBIDDEN, ERROR_CODES.ENTITLEMENT.REQUIRED, 'Asking requires a purchase');
      return;
    }
    if (!modelProvider) {
      sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.ASK.UNAVAILABLE, 'Asking is unavailable');
      return;
    }
    const usageDate = toUsageDate(now());
    const used = await reserveAskUsage(database, userId, usageDate, ASK.DAILY_LIMIT);
    if (used === null) {
      sendError(res, TOO_MANY_REQUESTS, ERROR_CODES.ASK.DAILY_LIMIT_REACHED, 'Daily ask limit reached');
      return;
    }
    let answer: string | null = null;
    try {
      answer = await modelProvider.answer(buildAskPrompt({ choiceIndex, message, question }));
    } catch {
      // No error object: an SDK error can carry the request, which holds the learner's message.
      logger.warn('ask model request failed');
    }
    if (answer === null) {
      await releaseAskUsage(database, userId, usageDate);
      sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.ASK.UNAVAILABLE, 'No answer is available right now');
      return;
    }
    res.status(OK).json({ data: { answer, remaining: ASK.DAILY_LIMIT - used } });
  });

  return router;
}

export { createAskRouter };
