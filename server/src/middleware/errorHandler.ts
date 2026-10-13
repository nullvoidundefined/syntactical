import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';

import { requestLog } from './requestLogger.js';

const { STATUS } = HTTP;
const { CLIENT_ERROR_MAX, CLIENT_ERROR_MIN } = STATUS;
// Postgres query_canceled (statement_timeout) and lock_not_available (lock_timeout).
const TIMEOUT_CODES = new Set(['57014', '55P03']);

function createNotFoundHandler() {
  return function notFoundHandler(_req: Request, res: Response): void {
    sendError(res, STATUS.NOT_FOUND, ERROR_CODES.ROUTING.NOT_FOUND, 'Not found');
  };
}

// Never log the error object: pg errors carry user data in message and detail.
function logUnhandled(err: unknown, res: Response, logger: Logger, requestId: string): void {
  const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
  const errorName = err instanceof Error ? err.name : typeof err;
  requestLog(res, logger.child({ requestId })).error(
    {
      constraint: typeof constraint === 'string' ? constraint : undefined,
      errorName,
      pgCode: typeof code === 'string' ? code : undefined,
      requestId,
    },
    'unhandled error',
  );
}

function createErrorHandler(logger: Logger) {
  // Express identifies an error handler by its four-argument arity.
  return function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    const { headersSent, locals } = res;
    const { requestId } = locals as { requestId: string };
    if (headersSent) {
      // The response already started, so no error body can follow. Log the error safely
      // and drop the connection; next(err) would let Express print the raw error to stderr.
      logUnhandled(err, res, logger, requestId);
      res.destroy();
      return;
    }
    const { type } = (err ?? {}) as { type?: string };
    const { BAD_REQUEST, INTERNAL_SERVER_ERROR, PAYLOAD_TOO_LARGE } = STATUS;

    if (type === 'entity.too.large') {
      sendError(res, PAYLOAD_TOO_LARGE, ERROR_CODES.INPUT.PAYLOAD_TOO_LARGE, 'Request body too large');
      return;
    }
    if (type === 'entity.parse.failed') {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.MALFORMED_JSON, 'Malformed JSON body');
      return;
    }

    const { status } = (err ?? {}) as { status?: unknown };
    if (typeof status === 'number' && status >= CLIENT_ERROR_MIN && status <= CLIENT_ERROR_MAX) {
      sendError(res, status, ERROR_CODES.INPUT.CLIENT_ERROR, 'Invalid request');
      return;
    }

    logUnhandled(err, res, logger, requestId);
    const { code } = (err ?? {}) as { code?: unknown };
    if (typeof code === 'string' && TIMEOUT_CODES.has(code)) {
      sendError(res, STATUS.SERVICE_UNAVAILABLE, ERROR_CODES.SERVER.BUSY, 'Server busy, retry shortly');
      return;
    }
    sendError(res, INTERNAL_SERVER_ERROR, ERROR_CODES.SERVER.INTERNAL_ERROR, 'Internal server error');
  };
}

export { createErrorHandler, createNotFoundHandler };
