// The three rate-limit key shapes the routes use. Each resolves the plaintext the limiter then
// HMACs under RATE_LIMIT_KEY_SECRET (rateLimitKey); the key is never stored as given here.
import type { Request, Response } from 'express';

// The normalized email a validator left in res.locals.email.
function keyOfEmail(_req: Request, res: Response): string {
  return String(res.locals.email);
}

function keyOfIp(req: Request): string {
  return req.ip ?? 'unknown';
}

// The user id requireSession left in res.locals.session.
function keyOfUser(_req: Request, res: Response): string {
  return String((res.locals.session as { userId: string }).userId);
}

export { keyOfEmail, keyOfIp, keyOfUser };
