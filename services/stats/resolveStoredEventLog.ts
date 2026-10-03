// Turns the raw stored answer event log into the log to start from. A
// malformed log is backed up before an empty log replaces it, and new
// events stay in memory when that backup cannot be written, so no stored
// answer is ever overwritten unseen.
import { logWarning } from '../../clients/logClient';
import { writeJson } from '../../clients/writeJson';
import { EVENT_LOG_STORAGE_KEY, REJECTED_EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';

import { isLoggedAnswerEvent } from './isLoggedAnswerEvent';
import type { LoggedAnswerEvent } from './types/LoggedAnswerEvent';

type ResolvedEventLog = { eventLog: LoggedAnswerEvent[]; isPersistenceBlocked: boolean };

const LOG_CONTEXT = { backupKey: REJECTED_EVENT_LOG_STORAGE_KEY, key: EVENT_LOG_STORAGE_KEY };

export async function resolveStoredEventLog(raw: unknown): Promise<ResolvedEventLog> {
  if (raw === null) return { eventLog: [], isPersistenceBlocked: false };
  if (Array.isArray(raw) && raw.every(isLoggedAnswerEvent)) return { eventLog: raw, isPersistenceBlocked: false };
  logWarning(LOG_CONTEXT, 'stored answer event log rejected');
  const isBackedUp = await writeJson(REJECTED_EVENT_LOG_STORAGE_KEY, raw);
  if (!isBackedUp) logWarning(LOG_CONTEXT, 'stored answer event log backup failed, keeping events in memory');
  return { eventLog: [], isPersistenceBlocked: !isBackedUp };
}
