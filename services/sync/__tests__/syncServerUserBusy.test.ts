// PR #33 review round 2, fix 6 (B-36): while another upload or profile update
// holds the user's row lock, the real server answers POST /v1/answer-events
// with 429 SYNC_USER_BUSY and Retry-After: 1 (server/src/routes/answerEvents.ts).
// The fake copies that envelope; runSyncPass leaves the batch unsynced and not
// held, reports failure, and the next pass retries the same batch and syncs it.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildOwnedLog, createFakeSyncServer } from './fakeSyncServer';
import type { FakeRequestInit, FakeResponse, FakeSyncServer } from './fakeSyncServer';
import { FAKE_REQUEST_ID, SERVER_ERROR_CODES, SERVER_STATUS } from './syncServerResponses';

const NOW = new Date(Date.UTC(2026, 9, 2, 12));

function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    heldIds: [] as string[],
    log: initialLog,
    userId,
    markHeld(ids: string[]): void {
      device.heldIds.push(...ids);
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, isHeld: true } : entry));
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

// Runs one pass and records every POST response the fake sent back.
async function runRecordedPass(device: Device, server: FakeSyncServer) {
  const postResponses: FakeResponse[] = [];
  async function request(path: string, init: FakeRequestInit = {}): Promise<FakeResponse> {
    const response = await server.request(path, init);
    if (init.method === 'POST') postResponses.push(response);
    return response;
  }
  const result = await runSyncPass({
    eventLog: device.log,
    isCurrent: () => true,
    markHeld: device.markHeld,
    markReleased: () => undefined,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    now: () => NOW,
    request,
    syncCursor: null,
    userId: device.userId,
  });
  return { postResponses, result };
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

function postedIds(post: { body: unknown }): string[] {
  return (post.body as { events: AnswerEvent[] }).events.map(({ eventId }) => eventId);
}

describe('429 SYNC_USER_BUSY on upload', () => {
  it('answers a busy upload with the server\'s 429 envelope and Retry-After: 1, storing nothing', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(3, userId));
    const server = createFakeSyncServer({ busyPostNumbers: new Set([1]) });

    const { postResponses } = await runRecordedPass(device, server);

    expect(postResponses[0]).toEqual({
      body: {
        error: {
          code: SERVER_ERROR_CODES.USER_BUSY,
          message: 'Another sync is in progress; retry shortly',
          requestId: FAKE_REQUEST_ID,
        },
      },
      headers: { 'Retry-After': '1' },
      status: SERVER_STATUS.TOO_MANY_REQUESTS,
    });
    expect(server.storedIds().size).toBe(0);
  });

  it('leaves the batch unsynced and not held and reports failure; the next pass retries the same batch and syncs it', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(3, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ busyPostNumbers: new Set([1]) });

    const { result: first } = await runRecordedPass(device, server);

    expect(first).toEqual({ isOk: false });
    expect(device.heldIds).toEqual([]);
    for (const entry of device.log) expect(entry).toMatchObject({ isHeld: false, isSynced: false });

    const { result: second } = await runRecordedPass(device, server);

    expect(second).toEqual({ isOk: true });
    expect(server.postRequests().map(postedIds)).toEqual([idsOf(log), idsOf(log)]);
    expect([...server.storedIds()].sort()).toEqual(idsOf(log).sort());
    for (const entry of device.log) expect(entry).toMatchObject({ isHeld: false, isSynced: true });
    expect(device.heldIds).toEqual([]);
  });
});
