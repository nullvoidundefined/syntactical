import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';

const { STATUS } = HTTP;

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
  return function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    const { requestId } = res.locals as { requestId: string };
    const { type } = (err ?? {}) as { type?: string };

    if (type === 'entity.too.large') {
      res
        .status(STATUS.PAYLOAD_TOO_LARGE)
        .json(createErrorResponse(ERROR_CODES.INPUT.PAYLOAD_TOO_LARGE, 'Request body too large', requestId));
      return;
    }
    if (type === 'entity.parse.failed') {
      res
        .status(STATUS.BAD_REQUEST)
        .json(createErrorResponse(ERROR_CODES.INPUT.MALFORMED_JSON, 'Malformed JSON body', requestId));
      return;
    }

    // Never log the error object: pg errors carry user data in message and detail.
    const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
    const errorName = err instanceof Error ? err.name : typeof err;
    const requestLog = (res.locals.logger as Logger | undefined) ?? logger.child({ requestId });
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
      .status(STATUS.INTERNAL_SERVER_ERROR)
      .json(createErrorResponse(ERROR_CODES.SERVER.INTERNAL_ERROR, 'Internal server error', requestId));
  };
}

export { createErrorHandler, createNotFoundHandler };
