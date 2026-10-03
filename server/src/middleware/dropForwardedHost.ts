import type { NextFunction, Request, Response } from 'express';

function dropForwardedHost(req: Request, _res: Response, next: NextFunction): void {
  delete req.headers['x-forwarded-host'];
  next();
}

export { dropForwardedHost };
