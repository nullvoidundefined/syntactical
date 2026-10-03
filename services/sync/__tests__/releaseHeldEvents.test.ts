// PR #33 review fix 5 (B-34, B-36): an event held as timestamp-future is
// released once its answeredAt is no more than 5 minutes ahead of the device
// clock, and uploads in the same pass; events held as timestamp-past,
// invalid-events, or invalid-batch stay held. releaseHeldEvents is the pure
// helper; runSyncPass applies it before building its upload batches and
// reports the released ids through markReleased.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { releaseHeldEvents } from '../releaseHeldEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer, hasOnlyAnswerEventKeys, toLogged } from './fakeSyncServer';
import type { FakeSyncServer } from './fakeSyncServer';

type HeldReason = NonNullable<LoggedAnswerEvent['heldReason']>;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NOW = new Date(Date.UTC(2026, 9, 2, 12));

let nextIndex = 0;

function heldEntry(ownerUserId: string | null, answeredAtMs: number, heldReason: HeldReason): LoggedAnswerEvent {
  nextIndex += 1;
  const event = { ...buildAnswerEvent(nextIndex), answeredAt: new Date(answeredAtMs).toISOString() };
  return { ...toLogged(event, ownerUserId, { isHeld: true }), heldReason };
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

describe('releaseHeldEvents', () => {
  const userId = randomUUID();
  const nowMs = NOW.getTime();

  it('releases the user\'s timestamp-future events now no more than 5 minutes ahead, clearing isHeld and heldReason, and leaves every other entry as it was', () => {
    const nowWithin = heldEntry(userId, nowMs + 3 * MINUTE_MS, 'timestamp-future');
    const atBound = heldEntry(userId, nowMs + 5 * MINUTE_MS, 'timestamp-future');
    const inPast = heldEntry(userId, nowMs - 2 * DAY_MS, 'timestamp-future');
    const stillAhead = heldEntry(userId, nowMs + 5 * MINUTE_MS + 1000, 'timestamp-future');
    const pastReason = heldEntry(userId, nowMs - 400 * DAY_MS, 'timestamp-past');
    const invalidEvents = heldEntry(userId, nowMs - MINUTE_MS, 'invalid-events');
    const invalidBatch = heldEntry(userId, nowMs - MINUTE_MS, 'invalid-batch');
    const otherUser = heldEntry(randomUUID(), nowMs + MINUTE_MS, 'timestamp-future');
    const guest = heldEntry(null, nowMs + MINUTE_MS, 'timestamp-future');
    const unheld = toLogged(buildAnswerEvent(900), userId);
    const log = [nowWithin, stillAhead, atBound, pastReason, invalidEvents, invalidBatch, otherUser, guest, unheld, inPast];
    const snapshot = JSON.parse(JSON.stringify(log)) as LoggedAnswerEvent[];

    const { eventLog, releasedIds } = releaseHeldEvents(log, userId, NOW);

    expect(releasedIds).toEqual(idsOf([nowWithin, atBound, inPast]));
    expect(idsOf(eventLog)).toEqual(idsOf(log));
    const released = new Set(releasedIds);
    for (const [index, entry] of eventLog.entries()) {
      if (released.has(entry.eventId)) {
        const { heldReason: _dropped, ...rest } = log[index];
        expect(entry).toEqual({ ...rest, isHeld: false });
        expect(entry).not.toHaveProperty('heldReason');
      } else {
        expect(entry).toEqual(log[index]);
      }
    }
    expect(log).toEqual(snapshot);
  });

  it('releases nothing when no timestamp-future event has come within 5 minutes', () => {
    const log = [
      heldEntry(userId, nowMs + 30 * MINUTE_MS, 'timestamp-future'),
      heldEntry(userId, nowMs + MINUTE_MS, 'timestamp-past'),
      ...buildOwnedLog(2, userId, 700),
    ];

    const { eventLog, releasedIds } = releaseHeldEvents(log, userId, NOW);

    expect(releasedIds).toEqual([]);
    expect(eventLog).toEqual(log);
  });
});

function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    log: initialLog,
    releasedCalls: [] as string[][],
    userId,
    markHeld(ids: string[], reason: HeldReason): void {
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, heldReason: reason, isHeld: true } : entry));
    },
    markReleased(ids: string[]): void {
      device.releasedCalls.push([...ids]);
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

function runPass(device: Device, server: FakeSyncServer, now?: () => Date) {
  return runSyncPass({
    eventLog: device.log,
    isCurrent: () => true,
    markHeld: device.markHeld,
    markReleased: device.markReleased,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    ...(now ? { now } : {}),
    request: server.request,
    syncCursor: null,
    userId: device.userId,
  });
}

function postedEvents(server: FakeSyncServer): AnswerEvent[] {
  return server.postRequests().flatMap(({ body }) => (body as { events: AnswerEvent[] }).events);
}

describe('runSyncPass releases held future events before uploading', () => {
  it('releases and uploads in the same pass a timestamp-future event now within 5 minutes, and keeps the other held events back', async () => {
    const userId = randomUUID();
    const nowMs = NOW.getTime();
    const nowWithin = heldEntry(userId, nowMs + 2 * MINUTE_MS, 'timestamp-future');
    const stillAhead = heldEntry(userId, nowMs + 20 * MINUTE_MS, 'timestamp-future');
    const stayHeld = [
      stillAhead,
      heldEntry(userId, nowMs - 400 * DAY_MS, 'timestamp-past'),
      heldEntry(userId, nowMs - MINUTE_MS, 'invalid-events'),
      heldEntry(userId, nowMs - MINUTE_MS, 'invalid-batch'),
    ];
    const pending = buildOwnedLog(2, userId, 800);
    const device = createDevice(userId, [...pending, nowWithin, ...stayHeld]);
    const server = createFakeSyncServer();

    const result = await runPass(device, server, () => NOW);

    expect(result).toEqual({ isOk: true });
    expect(device.releasedCalls.flat()).toEqual([nowWithin.eventId]);
    const posts = server.postRequests();
    expect(posts).toHaveLength(1);
    const posted = postedEvents(server);
    expect(idsOf(posted)).toEqual(idsOf([...pending, nowWithin]));
    for (const event of posted) expect(hasOnlyAnswerEventKeys(event)).toBe(true);
    const released = device.log.find(({ eventId }) => eventId === nowWithin.eventId);
    expect(released).toMatchObject({ isHeld: false, isSynced: true });
    expect(released).not.toHaveProperty('heldReason');
    for (const entry of stayHeld) {
      const stored = device.log.find(({ eventId }) => eventId === entry.eventId);
      expect(stored).toEqual(entry);
      expect(server.storedIds().has(entry.eventId)).toBe(false);
    }
  });

  it('releases nothing and posts nothing held when the injected clock leaves every future event more than 5 minutes ahead', async () => {
    const userId = randomUUID();
    const ahead = heldEntry(userId, NOW.getTime() + 6 * MINUTE_MS, 'timestamp-future');
    const device = createDevice(userId, [ahead]);
    const server = createFakeSyncServer();

    const result = await runPass(device, server, () => NOW);

    expect(result).toEqual({ isOk: true });
    expect(device.releasedCalls.flat()).toEqual([]);
    expect(server.postRequests()).toEqual([]);
    expect(device.log).toEqual([ahead]);
  });

  it('reads the real device clock when no clock is injected', async () => {
    const userId = randomUUID();
    const realNowMs = Date.now();
    const nowWithin = heldEntry(userId, realNowMs + MINUTE_MS, 'timestamp-future');
    const farAhead = heldEntry(userId, realNowMs + 60 * MINUTE_MS, 'timestamp-future');
    const device = createDevice(userId, [nowWithin, farAhead]);
    const server = createFakeSyncServer();

    await runPass(device, server);

    expect(device.releasedCalls.flat()).toEqual([nowWithin.eventId]);
    expect(idsOf(postedEvents(server))).toEqual([nowWithin.eventId]);
    expect(device.log.find(({ eventId }) => eventId === farAhead.eventId)).toEqual(farAhead);
  });
});
