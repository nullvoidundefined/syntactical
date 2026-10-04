// State-changing requests carry JSON or no body at all (B-30). A cross-site HTML form can send
// text/plain, urlencoded, or multipart without a CORS preflight; application/json cannot, so
// the exact-origin CORS allowlist then decides. The webhook routes are exempt: they are
// server-to-server and authenticate by their own authorization header.
import type { NextFunction, Request, Response } from 'express';

import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';

import { isJsonMediaType } from './isJsonMediaType.js';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WEBHOOK_PATH_PREFIX = '/v1/webhooks/';

function isBodyless(req: Request): boolean {
  const { 'content-length': contentLength, 'transfer-encoding': transferEncoding } = req.headers;
  return transferEncoding === undefined && (contentLength === undefined || Number(contentLength) === 0);
}

function requireJson(req: Request, res: Response, next: NextFunction): void {
  const { headers, method, path } = req;
  if (READ_ONLY_METHODS.has(method) || path.startsWith(WEBHOOK_PATH_PREFIX)) {
    next();
    return;
  }
  const { 'content-type': contentType } = headers;
  const isJson = isJsonMediaType(contentType);
  if (isJson || (contentType === undefined && isBodyless(req))) {
    next();
    return;
  }
  const { requestId } = res.locals as { requestId: string };
  res
    .status(HTTP.STATUS.UNSUPPORTED_MEDIA_TYPE)
    .json(createErrorResponse(ERROR_CODES.INPUT.UNSUPPORTED_MEDIA_TYPE, 'Content-Type must be application/json', requestId));
}

export { requireJson };
