// What the auth routes need from the caller of createApp. Optional members take production
// defaults there (the system clock, crypto.randomInt), so tests can inject a clock and a
// code generator.
import type { Database } from '../clients/database.js';
import type { EmailClient } from '../clients/emailTypes.js';
import type { PasswordBreachClient } from '../clients/passwordBreachClient.js';
import type { DeriveKey } from '../services/passwordHash.js';

interface PasswordHashSlots {
  run<T>(task: () => Promise<T>): Promise<T>;
}

interface AuthDeps {
  database: Database;
  // Replaces scrypt for password hashing; tests use it to count or hold derivations.
  deriveKey?: DeriveKey;
  // A current-parameter hash nobody can match, built once at startup; password sign-in verifies
  // against it when no usable stored hash exists, so every attempt costs one derivation.
  // Password sign-in is mounted only when this and passwordHashSlots are given.
  dummyPasswordHash?: string;
  emailClient: EmailClient;
  // Secure on the session cookie; false only under NODE_ENV=test.
  isCookieSecure: boolean;
  now?: () => Date;
  // Both are needed for the sign-up routes, which are mounted only when both are given.
  passwordBreachClient?: PasswordBreachClient;
  passwordHashSlots?: PasswordHashSlots;
  randomInt?: (min: number, max: number) => number;
  rateLimitKeySecret: string;
}

type OptionalKeys = 'deriveKey' | 'dummyPasswordHash' | 'passwordBreachClient' | 'passwordHashSlots';

type ResolvedAuthDeps = Required<Omit<AuthDeps, OptionalKeys>> & Pick<AuthDeps, OptionalKeys>;

type PasswordSessionsAuthDeps = ResolvedAuthDeps & Required<Pick<AuthDeps, 'dummyPasswordHash' | 'passwordHashSlots'>>;

type SignUpAuthDeps = ResolvedAuthDeps & Required<Pick<AuthDeps, 'passwordBreachClient' | 'passwordHashSlots'>>;

export type { AuthDeps, PasswordHashSlots, PasswordSessionsAuthDeps, ResolvedAuthDeps, SignUpAuthDeps };
