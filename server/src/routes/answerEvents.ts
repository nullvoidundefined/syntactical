// GET /v1/answer-events (B-36) pages through the caller's events; a bad cursor is 400.
// POST /v1/answer-events (B-32, B-33): uploads a batch of answer events. Session required and
// rate limited per user; its 256 KB body is read only after the session check. More than
// 200 events is 413; any other schema failure is 400; an event the answer key rejects, or a
// timestamp out of range, is 422 for the whole batch with the offending event ids; a batch
// that would take the user past the stored-event cap is 422 SYNC_EVENT_CAP_REACHED. Event
// contents are never logged.
import express, { Router } from 'express';
import type { Request, Response } from 'express';

import { HTTP } from '../constants/http.js';
import { SYNC } from '../constants/sync.js';
import { createErrorResponse, ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfUser } from '../middleware/rateLimitKeys.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { answerEventSchemas } from '../schemas/answerEventSchemas.js';
import { ingestAnswerEvents } from '../services/ingestAnswerEvents.js';
import { listAnswerEvents } from '../services/listAnswerEvents.js';

import type { ResolvedSyncDeps } from './syncDeps.js';

const {
  STATUS: { BAD_REQUEST, OK, PAYLOAD_TOO_LARGE, UNPROCESSABLE_ENTITY },
} = HTTP;

function isOverBatchLimit(body: unknown): boolean {
  const { events } = (body ?? {}) as { events?: unknown };
  return Array.isArray(events) && events.length > SYNC.MAX_BATCH;
}

function createAnswerEventsRouter(deps: ResolvedSyncDeps): Router {
  const { answerKey, database, now, rateLimitKeySecret } = deps;
  const router = Router();
  const requireSession = createRequireSession({ database, now });
  const perUser = createRateLimit({
    database,
    keyOf: keyOfUser,
    keySecret: rateLimitKeySecret,
    limit: SYNC.RATE_LIMIT.UPLOAD_PER_USER,
    now,
    scope: SYNC.RATE_LIMIT_SCOPE.UPLOAD,
    windowMs: SYNC.RATE_LIMIT.WINDOW_MS,
  });

  const downloadPerUser = createRateLimit({
    database,
    keyOf: keyOfUser,
    keySecret: rateLimitKeySecret,
    limit: SYNC.RATE_LIMIT.DOWNLOAD_PER_USER,
    now,
    scope: SYNC.RATE_LIMIT_SCOPE.DOWNLOAD,
    windowMs: SYNC.RATE_LIMIT.WINDOW_MS,
  });

  router.get('/answer-events', requireSession, downloadPerUser, async (req: Request, res: Response) => {
    const { session } = res.locals as { session: { userId: string } };
    const parsed = answerEventSchemas.download.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_QUERY, 'Invalid query');
      return;
    }
    res.status(OK).json({ data: await listAnswerEvents(database, session.userId, parsed.data.after) });
  });

  router.post(
    '/answer-events',
    requireSession,
    perUser,
    express.json({ limit: SYNC.BODY_LIMIT }),
    async (req: Request, res: Response) => {
      const { requestId, session } = res.locals as { requestId: string; session: { userId: string } };
      if (isOverBatchLimit(req.body)) {
        sendError(res, PAYLOAD_TOO_LARGE, ERROR_CODES.INPUT.PAYLOAD_TOO_LARGE, 'Too many events in one batch');
        return;
      }
      const parsed = answerEventSchemas.upload.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
        return;
      }
      const result = await ingestAnswerEvents(database, answerKey, session.userId, parsed.data.events, now());
      if (result.kind === 'stored') {
        const { totals } = result;
        res.status(OK).json({ data: totals });
        return;
      }
      if (result.kind === 'event-cap-reached') {
        sendError(res, UNPROCESSABLE_ENTITY, ERROR_CODES.SYNC.EVENT_CAP_REACHED, 'Stored event limit reached');
        return;
      }
      const { eventIds, kind } = result;
      const { code, message } =
        kind === 'invalid-events'
          ? { code: ERROR_CODES.SYNC.INVALID_EVENTS, message: 'Events do not match the answer key' }
          : { code: ERROR_CODES.SYNC.TIMESTAMP_OUT_OF_RANGE, message: 'Event timestamps out of range' };
      res.status(UNPROCESSABLE_ENTITY).json(createErrorResponse(code, message, requestId, { eventIds }));
    },
  );

  return router;
}

export { createAnswerEventsRouter };
