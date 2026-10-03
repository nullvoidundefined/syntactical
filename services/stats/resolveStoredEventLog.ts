// Turns the stored answer event log read into the log to start from. A
// read that failed starts empty with new events kept in memory, so a
// transient storage error never overwrites unsynced events. A
// malformed log is backed up before an empty log replaces it, and new
// events stay in memory when that backup cannot be written, so no stored
// answer is ever overwritten unseen.
import { logWarning } from '../../clients/logClient';
import type { StoredRead } from '../../clients/types/StoredRead';
import { writeJson } from '../../clients/writeJson';
import { EVENT_LOG_STORAGE_KEY, REJECTED_EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';

import { isLoggedAnswerEvent } from './isLoggedAnswerEvent';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

type ResolvedEventLog = { eventLog: LoggedAnswerEvent[]; isPersistenceBlocked: boolean };

const LOG_CONTEXT = { backupKey: REJECTED_EVENT_LOG_STORAGE_KEY, key: EVENT_LOG_STORAGE_KEY };

export async function resolveStoredEventLog(read: StoredRead): Promise<ResolvedEventLog> {
  const { isReadFailed, value: raw } = read;
  if (isReadFailed) return { eventLog: [], isPersistenceBlocked: true };
  if (raw === null) return { eventLog: [], isPersistenceBlocked: false };
  if (Array.isArray(raw) && raw.every(isLoggedAnswerEvent)) return { eventLog: raw, isPersistenceBlocked: false };
  logWarning(LOG_CONTEXT, 'stored answer event log rejected');
  const isBackedUp = await writeJson(REJECTED_EVENT_LOG_STORAGE_KEY, raw);
  if (!isBackedUp) logWarning(LOG_CONTEXT, 'stored answer event log backup failed, keeping events in memory');
  return { eventLog: [], isPersistenceBlocked: !isBackedUp };
}
