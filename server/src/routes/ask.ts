// POST /v1/ask: answers a learner's follow-up question about one quiz question, using Claude
// with the question, its answer key, and its explanation as context. Any signed-in user may ask
// about any bank's question. Each user gets ASK.DAILY_LIMIT.FREE answers per UTC day, or
// ASK.DAILY_LIMIT.PRO with Pro (hasPro, read on every ask, so Pro applies the same day), counting
// only answers given, under a per-minute burst limit.
//
// Order: session (401), burst limit (429), body (400), question lookup (404), model configured
// (503), daily limit for the user's tier (429 ASK_DAILY_LIMIT_REACHED, carrying tier, limit, and
// proLimit), model call (503 ASK_UNAVAILABLE on failure or decline, with the answer handed back).
// Answers { data: { answer, limit, proLimit, remaining, tier } }, so the app words its upsell from
// the tier and the server's numbers. The learner's message is never logged.
import { Router } from 'express';
import type { Logger } from 'pino';

import { ASK } from '../constants/ask.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfUser } from '../middleware/rateLimitKeys.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { askSchemas } from '../schemas/askSchemas.js';
import { buildAskPrompt } from '../services/buildAskPrompt.js';
import { hasPro } from '../services/hasPro.js';
import { releaseAskUsage } from '../services/releaseAskUsage.js';
import { reserveAskUsage } from '../services/reserveAskUsage.js';

import type { ResolvedAskDeps } from './askDeps.js';

const {
  STATUS: { BAD_REQUEST, NOT_FOUND, OK, SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS },
} = HTTP;

const BOOL_CHOICE_COUNT = 2;

// The user's Ask tier, read on every ask; the app branches its copy on it.
type AskTier = 'free' | 'pro';

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
    if (!modelProvider) {
      sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.ASK.UNAVAILABLE, 'Asking is unavailable');
      return;
    }
    const at = now();
    const tier: AskTier = (await hasPro(database, userId, at)) ? 'pro' : 'free';
    const limit = tier === 'pro' ? ASK.DAILY_LIMIT.PRO : ASK.DAILY_LIMIT.FREE;
    const proLimit = ASK.DAILY_LIMIT.PRO;
    const usageDate = toUsageDate(at);
    const used = await reserveAskUsage(database, userId, usageDate, limit);
    if (used === null) {
      const { requestId } = res.locals as { requestId: string };
      res.status(TOO_MANY_REQUESTS).json(
        createErrorResponse(ERROR_CODES.ASK.DAILY_LIMIT_REACHED, 'Daily ask limit reached', requestId, {
          limit,
          proLimit,
          tier,
        }),
      );
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
    res.status(OK).json({ data: { answer, limit, proLimit, remaining: limit - used, tier } });
  });

  return router;
}

export { createAskRouter };
