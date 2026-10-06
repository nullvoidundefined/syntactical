// What the /v1/admin routes need from the caller of createApp. The clock defaults to the system
// clock in createApp.
import type { Database } from '../clients/database.js';

interface AdminDeps {
  database: Database;
  now?: () => Date;
  paidProductIds: ReadonlySet<string>;
  rateLimitKeySecret: string;
}

type ResolvedAdminDeps = Required<AdminDeps>;

export type { AdminDeps, ResolvedAdminDeps };
