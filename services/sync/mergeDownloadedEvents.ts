// Merges a downloaded page into the event log: new events arrive synced and
// owned by the user; one already present is kept and marked synced. The log
// obeys the same cap as appendAnswerEvent.
import type { AnswerEvent } from '@syntactical/progress';

import { capEventLog } from '../stats/capEventLog';
import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

export function mergeDownloadedEvents(eventLog: LoggedAnswerEvent[], downloaded: AnswerEvent[], userId: string): LoggedAnswerEvent[] {
  const downloadedIds = new Set(downloaded.map(({ eventId }) => eventId));
  const presentIds = new Set<string>();
  const merged = eventLog.map((entry) => {
    const { eventId, isHeld, isSynced, ownerUserId } = entry;
    presentIds.add(eventId);
    const isOwnDownloaded = downloadedIds.has(eventId) && ownerUserId === userId;
    return isOwnDownloaded && (!isSynced || isHeld) ? { ...entry, isHeld: false, isSynced: true } : entry;
  });
  for (const event of downloaded) {
    if (presentIds.has(event.eventId)) continue;
    presentIds.add(event.eventId);
    merged.push({ ...event, isHeld: false, isSynced: true, ownerUserId: userId });
  }
  return capEventLog(merged);
}
