// Turns the stored answer event log read into the log to start from. A
// read that failed starts empty with new events kept in memory, so a
// transient storage error never overwrites unsynced events. Well-formed
// entries are kept; only malformed ones (or a stored value that is not a
// list at all) are appended to the rejected-entries backup, which is never
// overwritten. When that backup cannot be read or written, new events stay
// in memory, so no stored answer is ever overwritten unseen.
import { logWarning } from '../../clients/logClient';
import { readStoredJson } from '../../clients/readStoredJson';
import type { StoredRead } from '../../clients/types/StoredRead';
import { writeJson } from '../../clients/writeJson';
import { EVENT_LOG_STORAGE_KEY, REJECTED_EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';

import { isLoggedAnswerEvent } from './isLoggedAnswerEvent';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

type ResolvedEventLog = { eventLog: LoggedAnswerEvent[]; isPersistenceBlocked: boolean };

const LOG_CONTEXT = { backupKey: REJECTED_EVENT_LOG_STORAGE_KEY, key: EVENT_LOG_STORAGE_KEY };

async function appendToBackup(rejected: unknown[]): Promise<boolean> {
  const { isReadFailed, value: existing } = await readStoredJson(REJECTED_EVENT_LOG_STORAGE_KEY);
  if (isReadFailed) return false;
  const kept = existing === null ? [] : [existing].flat();
  return writeJson(REJECTED_EVENT_LOG_STORAGE_KEY, [...kept, ...rejected]);
}

export async function resolveStoredEventLog(read: StoredRead): Promise<ResolvedEventLog> {
  const { isReadFailed, value: raw } = read;
  if (isReadFailed) return { eventLog: [], isPersistenceBlocked: true };
  if (raw === null) return { eventLog: [], isPersistenceBlocked: false };
  const entries: unknown[] = Array.isArray(raw) ? raw : [raw];
  const eventLog = Array.isArray(raw) ? raw.filter(isLoggedAnswerEvent) : [];
  const rejected = Array.isArray(raw) ? entries.filter((entry) => !isLoggedAnswerEvent(entry)) : entries;
  if (rejected.length === 0) return { eventLog, isPersistenceBlocked: false };
  logWarning({ ...LOG_CONTEXT, rejectedCount: rejected.length }, 'stored answer event log entries rejected');
  const isBackedUp = await appendToBackup(rejected);
  if (!isBackedUp) logWarning(LOG_CONTEXT, 'stored answer event log backup failed, keeping events in memory');
  return { eventLog, isPersistenceBlocked: !isBackedUp };
}
