// Request bodies for the auth routes. Emails are normalized (trim, NFKC, lowercase) inside the
// schema, so every key and lookup downstream sees one form of the address.
import { z } from 'zod';

import { normalizeEmail } from '../services/normalizeEmail.js';

// RFC 5321 caps a forward path at 254 characters; the raw cap bounds normalization work.
const EMAIL_MAX_LENGTH = 254;
const RAW_EMAIL_MAX_LENGTH = 320;
// The longest IANA zone name is 32 characters; anything far longer is not a zone.
const TIMEZONE_MAX_LENGTH = 64;

const email = z.string().max(RAW_EMAIL_MAX_LENGTH).transform(normalizeEmail).pipe(z.email().max(EMAIL_MAX_LENGTH));

const authSchemas = {
  createSession: z.object({
    code: z.string().regex(/^\d{6}$/),
    email,
    timezone: z.string().max(TIMEZONE_MAX_LENGTH).optional(),
  }),
  issueCode: z.object({ email }),
  // Sign-in has no length policy; the password's size and form are checked by normalizePassword.
  passwordSignIn: z.object({
    email,
    password: z.string(),
    timezone: z.string().max(TIMEZONE_MAX_LENGTH).optional(),
  }),
  // The password's rules (length, normalization) are checked after parsing, so each failure gets its own code.
  startSignUp: z.object({ email, password: z.string() }),
  verifySignUp: z.object({
    code: z.string().regex(/^\d{6}$/),
    email,
    password: z.string(),
    timezone: z.string().max(TIMEZONE_MAX_LENGTH).optional(),
  }),
};

export { authSchemas };
