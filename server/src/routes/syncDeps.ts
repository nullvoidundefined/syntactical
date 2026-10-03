// What the /v1 sync routes need from the caller of createApp. The clock defaults to the
// system clock in createApp.
import type { Database } from '../clients/database.js';
import type { AnswerKey } from '../types/AnswerKey.js';

interface SyncDeps {
  answerKey: AnswerKey;
  database: Database;
  now?: () => Date;
  rateLimitKeySecret: string;
}

type ResolvedSyncDeps = Required<SyncDeps>;

export type { ResolvedSyncDeps, SyncDeps };
