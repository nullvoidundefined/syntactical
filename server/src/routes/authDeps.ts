// What the auth routes need from the caller of createApp. Optional members take production
// defaults there (the system clock, crypto.randomInt), so tests can inject a clock and a
// code generator.
import type { Database } from '../clients/database.js';
import type { EmailClient } from '../clients/emailTypes.js';

interface AuthDeps {
  database: Database;
  // The account deletion transaction's statement_timeout; tests inject a short one. Defaults to
  // AUTH.DELETION.STATEMENT_TIMEOUT_MS.
  deletionScrubMaxBytes?: number;
  // The purchase scrub's caps on candidate rows and payload text (B-59.13); tests inject small ones. Default to
  // AUTH.DELETION.SCRUB_MAX_ROWS and SCRUB_MAX_BYTES.
  deletionScrubMaxRows?: number;
  deletionStatementTimeoutMs?: number;
  emailClient: EmailClient;
  // Secure on the session cookie; false only under NODE_ENV=test.
  isCookieSecure: boolean;
  now?: () => Date;
  randomInt?: (min: number, max: number) => number;
  rateLimitKeySecret: string;
}

type ResolvedAuthDeps = Required<AuthDeps>;

export type { AuthDeps, ResolvedAuthDeps };
