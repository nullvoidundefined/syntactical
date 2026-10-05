// The password rules: NFKC-normalize, then 12 to 128 code points, any characters, never trimmed.
// The raw string is capped at 512 UTF-16 units before normalization, and a lone surrogate is
// malformed input. Results carry only a code, never the password.
import { AUTH } from '../constants/auth.js';
import { ERROR_CODES } from '../errors.js';

// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

type NormalizeResult =
  | { code: typeof ERROR_CODES.INPUT.INVALID_BODY; isOk: false }
  | { isOk: true; normalized: string };

type PolicyResult =
  | {
      code:
        | typeof ERROR_CODES.AUTH.PASSWORD_TOO_LONG
        | typeof ERROR_CODES.AUTH.PASSWORD_TOO_SHORT
        | typeof ERROR_CODES.INPUT.INVALID_BODY;
      isOk: false;
    }
  | { isOk: true; normalized: string };

function normalizePassword(raw: string): NormalizeResult {
  if (raw.length > AUTH.PASSWORD.RAW_MAX_LENGTH || LONE_SURROGATE.test(raw)) {
    return { code: ERROR_CODES.INPUT.INVALID_BODY, isOk: false };
  }
  return { isOk: true, normalized: raw.normalize('NFKC') };
}

function checkPasswordPolicy(raw: string): PolicyResult {
  const result = normalizePassword(raw);
  if (!result.isOk) return result;
  const length = Array.from(result.normalized).length;
  if (length < AUTH.PASSWORD.MIN_LENGTH) return { code: ERROR_CODES.AUTH.PASSWORD_TOO_SHORT, isOk: false };
  if (length > AUTH.PASSWORD.MAX_LENGTH) return { code: ERROR_CODES.AUTH.PASSWORD_TOO_LONG, isOk: false };
  return result;
}

export { checkPasswordPolicy, normalizePassword };
