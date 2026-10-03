import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
import { SYNC } from '../constants/sync.js';
import { TRANSACTION_TIMEOUTS } from '../constants/transactionTimeouts.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';

const { STATUS } = HTTP;
const { CLIENT_ERROR_MAX, CLIENT_ERROR_MIN } = STATUS;

function createNotFoundHandler() {
  return function notFoundHandler(_req: Request, res: Response): void {
    const { requestId } = res.locals as { requestId: string };
    res
      .status(STATUS.NOT_FOUND)
      .json(createErrorResponse(ERROR_CODES.ROUTING.NOT_FOUND, 'Not found', requestId));
  };
}

// Never log the error object: pg errors carry user data in message and detail.
function logUnhandled(err: unknown, requestLogger: Logger | undefined, logger: Logger, requestId: string): void {
  const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
  const errorName = err instanceof Error ? err.name : typeof err;
  (requestLogger ?? logger.child({ requestId })).error(
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
      logUnhandled(err, locals.logger as Logger | undefined, logger, requestId);
      res.destroy();
      return;
    }
    const { type } = (err ?? {}) as { type?: string };
    const { BAD_REQUEST, INTERNAL_SERVER_ERROR, PAYLOAD_TOO_LARGE } = STATUS;

    if (type === 'entity.too.large') {
      res
        .status(PAYLOAD_TOO_LARGE)
        .json(createErrorResponse(ERROR_CODES.INPUT.PAYLOAD_TOO_LARGE, 'Request body too large', requestId));
      return;
    }
    if (type === 'entity.parse.failed') {
      res
        .status(BAD_REQUEST)
        .json(createErrorResponse(ERROR_CODES.INPUT.MALFORMED_JSON, 'Malformed JSON body', requestId));
      return;
    }

    const { status } = (err ?? {}) as { status?: unknown };
    if (typeof status === 'number' && status >= CLIENT_ERROR_MIN && status <= CLIENT_ERROR_MAX) {
      res.status(status).json(createErrorResponse(ERROR_CODES.INPUT.CLIENT_ERROR, 'Invalid request', requestId));
      return;
    }

    logUnhandled(err, locals.logger as Logger | undefined, logger, requestId);
    const { code } = (err ?? {}) as { code?: unknown };
    const { LOCK_TIMEOUT_CODE, STATEMENT_TIMEOUT_CODE } = TRANSACTION_TIMEOUTS;
    if (code === STATEMENT_TIMEOUT_CODE || code === LOCK_TIMEOUT_CODE) {
      res
        .status(STATUS.SERVICE_UNAVAILABLE)
        .set('Retry-After', String(SYNC.BUSY_RETRY_AFTER_SECONDS))
        .json(createErrorResponse(ERROR_CODES.SERVER.BUSY, 'Server busy, retry shortly', requestId));
      return;
    }
    res
      .status(INTERNAL_SERVER_ERROR)
      .json(createErrorResponse(ERROR_CODES.SERVER.INTERNAL_ERROR, 'Internal server error', requestId));
  };
}

export { createErrorHandler, createNotFoundHandler };
