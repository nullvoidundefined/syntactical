import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

// Binds a per-request child logger carrying requestId and logs one line when the response finishes.
// Headers are never logged: only method, route template, status, and duration.
function createRequestLogger(logger: Logger) {
  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const { requestId } = res.locals as { requestId: string };
    const requestLog = logger.child({ requestId });
    const { method } = req;
    const startedAt = Date.now();
    res.locals.logger = requestLog;

    res.on('finish', () => {
      // The route template, never the raw path: a path parameter can carry a secret.
      const { baseUrl, route } = req;
      const url = route ? `${baseUrl}${String((route as { path: unknown }).path)}` : 'unmatched';
      requestLog.info(
        {
          durationMs: Date.now() - startedAt,
          req: { method, url },
          res: { statusCode: res.statusCode },
        },
        'request completed',
      );
    });
    next();
  };
}

export { createRequestLogger };
