// Request bodies for the auth routes. Emails are normalized (trim, NFKC, lowercase) inside the
// schema, so every key and lookup downstream sees one form of the address.
import { z } from 'zod';

import { normalizeEmail } from '../services/normalizeEmail.js';

// RFC 5321 caps a forward path at 254 characters; the raw cap bounds normalization work.
const EMAIL_MAX_LENGTH = 254;
const RAW_EMAIL_MAX_LENGTH = 320;

const email = z.string().max(RAW_EMAIL_MAX_LENGTH).transform(normalizeEmail).pipe(z.email().max(EMAIL_MAX_LENGTH));

const authSchemas = {
  issueCode: z.object({ email }),
};

export { authSchemas };
