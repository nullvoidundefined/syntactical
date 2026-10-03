import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
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

function createErrorHandler(logger: Logger) {
  // Express identifies an error handler by its four-argument arity.
  return function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    const { headersSent, locals } = res;
    if (headersSent) {
      next(err);
      return;
    }
    const { requestId } = locals as { requestId: string };
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

    // Never log the error object: pg errors carry user data in message and detail.
    const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
    const errorName = err instanceof Error ? err.name : typeof err;
    const requestLog = (locals.logger as Logger | undefined) ?? logger.child({ requestId });
    requestLog.error(
      {
        constraint: typeof constraint === 'string' ? constraint : undefined,
        errorName,
        pgCode: typeof code === 'string' ? code : undefined,
        requestId,
      },
      'unhandled error',
    );
    res
      .status(INTERNAL_SERVER_ERROR)
      .json(createErrorResponse(ERROR_CODES.SERVER.INTERNAL_ERROR, 'Internal server error', requestId));
  };
}

export { createErrorHandler, createNotFoundHandler };
