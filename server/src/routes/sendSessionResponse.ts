// The 201 answer that opens a session (B-28), shared by the code and sign-up routes. A web client
// gets the token only as an HttpOnly cookie; a native client (X-Client: native) gets it in the
// body and no cookie.
import type { Request, Response } from 'express';

import { sessionCookieOptions } from '../config/sessionCookieOptions.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';

const {
  SESSION: { ABSOLUTE_TTL_MS, COOKIE_NAME },
} = AUTH;
const NATIVE_CLIENT = 'native';
const TOKEN_FIELD = 'token';

interface SessionResponseInput {
  // Fields added to the body next to userId.
  extra?: Record<string, unknown>;
  isCookieSecure: boolean;
  sessionToken: string;
  userId: string;
}

function sendSessionResponse(req: Request, res: Response, input: SessionResponseInput): void {
  const { extra = {}, isCookieSecure, sessionToken, userId } = input;
  if (req.get('X-Client') === NATIVE_CLIENT) {
    res.status(HTTP.STATUS.CREATED).json({ data: { [TOKEN_FIELD]: sessionToken, userId, ...extra } });
    return;
  }
  res.cookie(COOKIE_NAME, sessionToken, { ...sessionCookieOptions(isCookieSecure), maxAge: ABSOLUTE_TTL_MS });
  res.status(HTTP.STATUS.CREATED).json({ data: { userId, ...extra } });
}

export { sendSessionResponse };
