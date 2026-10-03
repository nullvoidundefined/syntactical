import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

// Always generated server-side; a client-supplied X-Request-Id is never trusted or logged.
function requestId(_req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export { requestId };
