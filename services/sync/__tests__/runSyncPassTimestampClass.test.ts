// PR #33 review round 2, fix 5 (B-34, B-36): on 422
// SYNC_TIMESTAMP_OUT_OF_RANGE an event is held as timestamp-past only when its
// answeredAt is more than 365 days before the device clock (the server's past
// bound). Every other named event is timestamp-future, so the release check
// lets it upload once it is within 5 minutes of the device clock.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, createFakeSyncServer, toLogged } from './fakeSyncServer';
import type { FakeSyncServer } from './fakeSyncServer';

type HeldReason = NonNullable<LoggedAnswerEvent['heldReason']>;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NOW = new Date(Date.UTC(2026, 9, 2, 12));
const NOW_MS = NOW.getTime();

function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    log: initialLog,
    userId,
    markHeld(ids: string[], reason: HeldReason): void {
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, heldReason: reason, isHeld: true } : entry));
    },
    markReleased(ids: string[]): void {
      const released = new Set(ids);
      device.log = device.log.map((entry) => {
        if (!released.has(entry.eventId)) return entry;
        const { heldReason: _dropped, ...rest } = entry;
        return { ...rest, isHeld: false };
      });
    },
    markSynced(ids: string[]): void {
      const synced = new Set(ids);
      device.log = device.log.map((entry) => (synced.has(entry.eventId) ? { ...entry, isSynced: true } : entry));
    },
    mergeDownloaded(events: AnswerEvent[]): void {
      device.log = mergeDownloadedEvents(device.log, events, userId);
    },
  };
  return device;
}

type Device = ReturnType<typeof createDevice>;

function runPass(device: Device, server: FakeSyncServer) {
  return runSyncPass({
    eventLog: device.log,
    isCurrent: () => true,
    markHeld: device.markHeld,
    markReleased: device.markReleased,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    now: () => NOW,
    request: server.request,
    syncCursor: null,
    userId: device.userId,
  });
}

function answeredAt(index: number, userId: string, answeredAtMs: number): LoggedAnswerEvent {
  return toLogged({ ...buildAnswerEvent(index), answeredAt: new Date(answeredAtMs).toISOString() }, userId);
}

function entryOf(device: Device, eventId: string): LoggedAnswerEvent | undefined {
  return device.log.find((entry) => entry.eventId === eventId);
}

function postedIds(server: FakeSyncServer): string[] {
  return server.postRequests().flatMap(({ body }) => (body as { events: AnswerEvent[] }).events.map(({ eventId }) => eventId));
}

describe('runSyncPass classifies a timestamp rejection by the server\'s past bound', () => {
  it('holds as timestamp-future an event the device clock is 10 minutes ahead of, and releases and uploads it on the next pass', async () => {
    const userId = randomUUID();
    const behindClock = answeredAt(1, userId, NOW_MS - 10 * MINUTE_MS);
    const plain = answeredAt(2, userId, NOW_MS - 20 * MINUTE_MS);
    const device = createDevice(userId, [behindClock, plain]);
    const outOfRange = new Set([behindClock.eventId]);
    const server = createFakeSyncServer({ outOfRangeEventIds: outOfRange });

    const first = await runPass(device, server);

    expect(first).toEqual({ isOk: true });
    expect(entryOf(device, behindClock.eventId)).toMatchObject({ heldReason: 'timestamp-future', isHeld: true, isSynced: false });
    expect(entryOf(device, plain.eventId)).toMatchObject({ isHeld: false, isSynced: true });

    outOfRange.clear();
    const postsBefore = postedIds(server).length;
    const second = await runPass(device, server);

    expect(second).toEqual({ isOk: true });
    expect(postedIds(server).slice(postsBefore)).toEqual([behindClock.eventId]);
    expect(server.storedIds().has(behindClock.eventId)).toBe(true);
    const released = entryOf(device, behindClock.eventId);
    expect(released).toMatchObject({ isHeld: false, isSynced: true });
    expect(released).not.toHaveProperty('heldReason');
  });

  it('holds as timestamp-future an event exactly 365 days old and one 2 days old, neither past the server\'s bound', async () => {
    const userId = randomUUID();
    const atBound = answeredAt(1, userId, NOW_MS - 365 * DAY_MS);
    const twoDaysOld = answeredAt(2, userId, NOW_MS - 2 * DAY_MS);
    const device = createDevice(userId, [atBound, twoDaysOld]);
    const server = createFakeSyncServer({ outOfRangeEventIds: new Set([atBound.eventId, twoDaysOld.eventId]) });

    await runPass(device, server);

    for (const entry of [atBound, twoDaysOld]) {
      expect(entryOf(device, entry.eventId)).toMatchObject({ heldReason: 'timestamp-future', isHeld: true, isSynced: false });
    }
  });

  it('holds as timestamp-past an event 366 days old and never posts it on a later pass', async () => {
    const userId = randomUUID();
    const tooOld = answeredAt(1, userId, NOW_MS - 366 * DAY_MS);
    const device = createDevice(userId, [tooOld]);
    const outOfRange = new Set([tooOld.eventId]);
    const server = createFakeSyncServer({ outOfRangeEventIds: outOfRange });

    await runPass(device, server);

    expect(entryOf(device, tooOld.eventId)).toMatchObject({ heldReason: 'timestamp-past', isHeld: true, isSynced: false });

    outOfRange.clear();
    const postsBefore = postedIds(server).length;
    await runPass(device, server);

    expect(postedIds(server).slice(postsBefore)).toEqual([]);
    expect(entryOf(device, tooOld.eventId)).toMatchObject({ heldReason: 'timestamp-past', isHeld: true, isSynced: false });
  });

  it('holds as timestamp-future an event more than 5 minutes ahead of the device clock', async () => {
    const userId = randomUUID();
    const ahead = answeredAt(1, userId, NOW_MS + 60 * MINUTE_MS);
    const device = createDevice(userId, [ahead]);
    const server = createFakeSyncServer({ outOfRangeEventIds: new Set([ahead.eventId]) });

    await runPass(device, server);

    expect(entryOf(device, ahead.eventId)).toMatchObject({ heldReason: 'timestamp-future', isHeld: true, isSynced: false });
  });
});
