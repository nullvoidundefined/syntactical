// The password policy at the HTTP edge: resolves the NFKC form, or sends the policy error and
// resolves undefined. Owns the message for each policy code; the codes come from
// services/checkPasswordPolicy, which never sees the response.
import type { Response } from 'express';

import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { checkPasswordPolicy } from '../services/checkPasswordPolicy.js';

const POLICY_MESSAGES: Record<string, string> = {
  [ERROR_CODES.AUTH.PASSWORD_TOO_LONG]: 'Password is too long',
  [ERROR_CODES.AUTH.PASSWORD_TOO_SHORT]: 'Password is too short',
  [ERROR_CODES.INPUT.INVALID_BODY]: 'Invalid request body',
};

function acceptPasswordPolicy(res: Response, raw: string): string | undefined {
  const policy = checkPasswordPolicy(raw);
  if (!policy.isOk) {
    sendError(res, HTTP.STATUS.BAD_REQUEST, policy.code, POLICY_MESSAGES[policy.code] ?? 'Invalid password');
    return undefined;
  }
  return policy.normalized;
}

export { acceptPasswordPolicy };
