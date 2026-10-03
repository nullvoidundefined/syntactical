// What the auth routes need from the caller of createApp. Optional members take production
// defaults there (the system clock, crypto.randomInt), so tests can inject a clock and a
// code generator.
import type { Database } from '../clients/database.js';
import type { EmailClient } from '../clients/emailTypes.js';

interface AuthDeps {
  database: Database;
  emailClient: EmailClient;
  // Secure on the session cookie; false only under NODE_ENV=test.
  isCookieSecure: boolean;
  now?: () => Date;
  randomInt?: (min: number, max: number) => number;
  rateLimitKeySecret: string;
}

type ResolvedAuthDeps = Required<AuthDeps>;

export type { AuthDeps, ResolvedAuthDeps };
