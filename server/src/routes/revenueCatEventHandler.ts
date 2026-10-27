// The RevenueCat event intake both webhook routes share: the JSON-only guard, and the handler.
// The handler reads the event type first with a minimal schema (400 when the body has none). A
// type outside HANDLED_TYPES answers 200 ignored without the full schema, because RevenueCat
// leaves the fields a purchase carries out of some types and would redeliver a 400 forever. Only a
// handled type is validated in full (400 when it is not a RevenueCat purchase event) and recorded
// once with its entitlement recomputed (recordPurchaseEvent) in one transaction. Authentication is
// the mounting router's job. The payload and the app user id are never logged.
// A TRANSFER has its own shape (no product, two lists of app user ids) and moves Pro between users (transferPurchaseEvents).
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';

import type { Database } from '../clients/database.js';
import { HTTP } from '../constants/http.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { isJsonMediaType } from '../middleware/isJsonMediaType.js';
import { requestLog } from '../middleware/requestLogger.js';
import { revenueCatSchemas } from '../schemas/revenueCatSchemas.js';
import { recordPurchaseEvent } from '../services/recordPurchaseEvent.js';
import { transferPurchaseEvents } from '../services/transferPurchaseEvents.js';

const {
  STATUS: { BAD_REQUEST, OK, UNSUPPORTED_MEDIA_TYPE },
} = HTTP;

const { EXPIRY_ONLY_TYPES, GRANT_TYPES, REVOKE_TYPES, TRANSFER_TYPE } = REVENUECAT_EVENTS;

const HANDLED_TYPES: ReadonlySet<string> = new Set([
  ...GRANT_TYPES,
  ...REVOKE_TYPES,
  ...EXPIRY_ONLY_TYPES,
  TRANSFER_TYPE,
]);

interface EventHandlerOptions {
  acceptSandbox: boolean;
  database: Database;
  logger: Logger;
}

function requireJsonBody(req: Request, res: Response, next: NextFunction): void {
  if (isJsonMediaType(req.headers['content-type'])) {
    next();
    return;
  }
  sendError(
    res,
    UNSUPPORTED_MEDIA_TYPE,
    ERROR_CODES.INPUT.UNSUPPORTED_MEDIA_TYPE,
    'Content-Type must be application/json',
  );
}

function sendInvalidBody(res: Response): void {
  sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
}

function createRevenueCatEventHandler(options: EventHandlerOptions): RequestHandler {
  const { acceptSandbox, database, logger } = options;
  return async (req: Request, res: Response) => {
    const typed = revenueCatSchemas.eventType.safeParse(req.body);
    if (!typed.success) {
      sendInvalidBody(res);
      return;
    }
    const { type } = typed.data.event;
    if (!HANDLED_TYPES.has(type)) {
      res.status(OK).json({ data: { status: 'ignored' } });
      return;
    }
    const log = requestLog(res, logger);
    if (type === TRANSFER_TYPE) {
      const transfer = revenueCatSchemas.transfer.safeParse(req.body);
      if (!transfer.success) {
        sendInvalidBody(res);
        return;
      }
      const status = await transferPurchaseEvents({
        acceptSandbox,
        database,
        event: transfer.data.event,
        logger: log,
      });
      res.status(OK).json({ data: { status } });
      return;
    }
    const { data, success } = revenueCatSchemas.webhook.safeParse(req.body);
    if (!success) {
      sendInvalidBody(res);
      return;
    }
    const status = await recordPurchaseEvent({ acceptSandbox, database, event: data.event, logger: log });
    res.status(OK).json({ data: { status } });
  };
}

export { createRevenueCatEventHandler, requireJsonBody };
