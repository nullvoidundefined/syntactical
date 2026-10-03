import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

// Binds a per-request child logger carrying requestId and logs one line when the response finishes.
// Headers are never logged: only method, path, status, and duration.
function createRequestLogger(logger: Logger) {
  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const { requestId } = res.locals as { requestId: string };
    const requestLog = logger.child({ requestId });
    const { method, path } = req;
    const startedAt = Date.now();
    res.locals.logger = requestLog;

    res.on('finish', () => {
      requestLog.info(
        {
          durationMs: Date.now() - startedAt,
          req: { method, url: path },
          res: { statusCode: res.statusCode },
        },
        'request completed',
      );
    });
    next();
  };
}

export { createRequestLogger };
