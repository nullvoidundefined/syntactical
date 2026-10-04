import { randomUUID } from 'node:crypto';

import { EVENT_LOG_CAP } from '../../../constants/appConfig';
import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { buildUploadBatches } from '../buildUploadBatches';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { buildAnswerEvent, buildOwnedLog, stripToAnswerEvent, toLogged } from './fakeSyncServer';

const userId = randomUUID();

function idsOf(log: LoggedAnswerEvent[]): string[] {
  return log.map(({ eventId }) => eventId);
}

function countId(log: LoggedAnswerEvent[], eventId: string): number {
  return log.filter((entry) => entry.eventId === eventId).length;
}

describe('mergeDownloadedEvents', () => {
  it('adds each new downloaded event as owned by the user, synced, and not held', () => {
    const log = buildOwnedLog(2, userId);
    const downloaded = [buildAnswerEvent(10), buildAnswerEvent(11)];
    const next = mergeDownloadedEvents(log, downloaded, userId);
    expect(next).toHaveLength(4);
    for (const event of downloaded) {
      const entry = next.find(({ eventId }) => eventId === event.eventId);
      expect(entry).toEqual({ ...event, isHeld: false, isSynced: true, ownerUserId: userId });
    }
    for (const entry of log) {
      expect(next.find(({ eventId }) => eventId === entry.eventId)).toEqual(entry);
    }
  });

  it('keeps an already-present event once and marks it synced', () => {
    const existing = toLogged(buildAnswerEvent(0), userId);
    const other = toLogged(buildAnswerEvent(1), userId);
    const next = mergeDownloadedEvents([existing, other], [stripToAnswerEvent(existing)], userId);
    expect(next).toHaveLength(2);
    expect(countId(next, existing.eventId)).toBe(1);
    expect(next.find(({ eventId }) => eventId === existing.eventId)?.isSynced).toBe(true);
    expect(next.find(({ eventId }) => eventId === other.eventId)?.isSynced).toBe(false);
  });

  it('changes nothing when the same page is merged twice', () => {
    const log = buildOwnedLog(3, userId);
    const page = [stripToAnswerEvent(log[1]), buildAnswerEvent(20), buildAnswerEvent(21)];
    const once = mergeDownloadedEvents(log, page, userId);
    const twice = mergeDownloadedEvents(once, page, userId);
    expect(twice).toEqual(once);
    expect(new Set(idsOf(twice)).size).toBe(twice.length);
  });

  it('leaves the input log unchanged', () => {
    const log = buildOwnedLog(2, userId);
    const before = JSON.parse(JSON.stringify(log));
    mergeDownloadedEvents(log, [stripToAnswerEvent(log[0]), buildAnswerEvent(5)], userId);
    expect(log).toEqual(before);
  });

  it('caps the log at 5,000 entries by trimming the oldest synced entries first', () => {
    const log = buildOwnedLog(EVENT_LOG_CAP, userId).map((entry, index) => ({ ...entry, isSynced: index < 100 }));
    const downloaded = Array.from({ length: 50 }, (_unused, index) => buildAnswerEvent(EVENT_LOG_CAP + index));
    const next = mergeDownloadedEvents(log, downloaded, userId);
    const ids = new Set(idsOf(next));
    expect(next).toHaveLength(EVENT_LOG_CAP);
    for (const entry of log.slice(0, 50)) expect(ids.has(entry.eventId)).toBe(false);
    for (const entry of log.slice(50)) expect(ids.has(entry.eventId)).toBe(true);
    for (const event of downloaded) expect(ids.has(event.eventId)).toBe(true);
  });

  it('never drops an unsynced entry while synced entries remain to trim', () => {
    const unsynced = buildOwnedLog(EVENT_LOG_CAP - 10, userId);
    const synced = buildOwnedLog(10, userId, EVENT_LOG_CAP).map((entry) => ({ ...entry, isSynced: true }));
    const downloaded = Array.from({ length: 30 }, (_unused, index) => buildAnswerEvent(2 * EVENT_LOG_CAP + index));
    const next = mergeDownloadedEvents([...unsynced, ...synced], downloaded, userId);
    const ids = new Set(idsOf(next));
    expect(next).toHaveLength(EVENT_LOG_CAP);
    for (const entry of unsynced) expect(ids.has(entry.eventId)).toBe(true);
    expect(next.filter(({ isSynced }) => isSynced)).toHaveLength(10);
  });

  it('keeps every unsynced entry when a full unsynced log receives a download', () => {
    const log = buildOwnedLog(EVENT_LOG_CAP, userId);
    const downloaded = Array.from({ length: 10 }, (_unused, index) => buildAnswerEvent(EVENT_LOG_CAP + index));
    const next = mergeDownloadedEvents(log, downloaded, userId);
    const ids = new Set(idsOf(next));
    expect(next).toHaveLength(EVENT_LOG_CAP);
    for (const entry of log) expect(ids.has(entry.eventId)).toBe(true);
  });

  it('marks a held entry synced and no longer held, so it is not uploaded again', () => {
    const held = toLogged(buildAnswerEvent(0), userId, { isHeld: true });
    const pending = toLogged(buildAnswerEvent(1), userId);

    const next = mergeDownloadedEvents([held, pending], [stripToAnswerEvent(held)], userId);

    expect(next.filter(({ eventId }) => eventId === held.eventId)).toEqual([{ ...held, isHeld: false, isSynced: true }]);
    expect(buildUploadBatches(next, userId).flat().map(({ eventId }) => eventId)).toEqual([pending.eventId]);
  });

  it('leaves another owner\'s unsynced entry unsynced when a downloaded id matches it', () => {
    const foreign = toLogged(buildAnswerEvent(0), randomUUID());
    const guest = toLogged(buildAnswerEvent(1), null);

    const next = mergeDownloadedEvents([foreign, guest], [stripToAnswerEvent(foreign), stripToAnswerEvent(guest)], userId);

    expect(next).toEqual([foreign, guest]);
  });
});
