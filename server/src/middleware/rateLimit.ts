// Fixed-window rate limiting on the Postgres rate_limit_counters table (B-26, B-63). Each
// request increments its counter with one atomic upsert and reads the new count back, so
// concurrent requests can never all see a count under the limit. Keys are HMACs under
// RATE_LIMIT_KEY_SECRET (rateLimitKey), never a plaintext or bare-hashed email or IP. The
// same statement deletes every counter from an earlier window, so no stale row outlives
// its window by more than one request to any limited route.
import type { NextFunction, Request, Response } from 'express';

import type { Database } from '../clients/database.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import { rateLimitKey } from '../services/rateLimitKey.js';

// SKIP LOCKED: concurrent requests never wait on, or deadlock over, the same stale rows.
const INCREMENT_SQL = `
  WITH expired AS (
    DELETE FROM rate_limit_counters
    WHERE ctid IN (SELECT ctid FROM rate_limit_counters WHERE window_start < $2 FOR UPDATE SKIP LOCKED)
  )
  INSERT INTO rate_limit_counters (key, window_start, count)
  VALUES ($1, $2, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
  RETURNING count`;

interface RateLimitOptions {
  database: Database;
  keyOf: (req: Request, res: Response) => string;
  keySecret: string;
  limit: number;
  now: () => Date;
  scope: string;
  windowMs: number;
}

function createRateLimit(options: RateLimitOptions) {
  const { database, keyOf, keySecret, limit, now, scope, windowMs } = options;
  return async function rateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const windowStart = new Date(Math.floor(now().getTime() / windowMs) * windowMs);
    const key = rateLimitKey(keySecret, scope, keyOf(req, res));
    const { rows } = await database.query<{ count: number }>(INCREMENT_SQL, [key, windowStart]);
    const [{ count } = { count: Number.POSITIVE_INFINITY }] = rows;
    if (count > limit) {
      const { requestId } = res.locals as { requestId: string };
      res
        .status(HTTP.STATUS.TOO_MANY_REQUESTS)
        .json(createErrorResponse(ERROR_CODES.RATE_LIMIT.EXCEEDED, 'Too many requests', requestId));
      return;
    }
    next();
  };
}

export { createRateLimit };
