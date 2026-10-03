import type { NextFunction, Request, Response } from 'express';

// Trusting one proxy hop is for req.ip only. Express reads the leftmost
// X-Forwarded-Host and X-Forwarded-Proto entry, which a client controls, so drop
// both; absolute URLs come from PUBLIC_BASE_URL, never from the request.
function dropForwardedHeaders(req: Request, _res: Response, next: NextFunction): void {
  const { headers } = req;
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  next();
}

export { dropForwardedHeaders };
