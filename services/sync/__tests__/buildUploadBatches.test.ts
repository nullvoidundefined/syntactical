import { randomUUID } from 'node:crypto';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { buildUploadBatches } from '../buildUploadBatches';
import { buildAnswerEvent, buildOwnedLog, hasOnlyAnswerEventKeys, stripToAnswerEvent, toLogged } from './fakeSyncServer';

const userId = randomUUID();
const otherUserId = randomUUID();

function flatIds(batches: { eventId: string }[][]): string[] {
  return batches.flat().map(({ eventId }) => eventId);
}

describe('buildUploadBatches', () => {
  it('includes only the unsynced, unheld entries owned by the user, in log order', () => {
    const log: LoggedAnswerEvent[] = [
      toLogged(buildAnswerEvent(0), userId),
      toLogged(buildAnswerEvent(1), otherUserId),
      toLogged(buildAnswerEvent(2), null),
      toLogged(buildAnswerEvent(3), userId, { isSynced: true }),
      toLogged(buildAnswerEvent(4), userId, { isHeld: true }),
      toLogged(buildAnswerEvent(5), userId),
      toLogged(buildAnswerEvent(6), otherUserId),
      toLogged(buildAnswerEvent(7), userId),
    ];
    const batches = buildUploadBatches(log, userId);
    expect(flatIds(batches)).toEqual([log[0].eventId, log[5].eventId, log[7].eventId]);
  });

  it('never includes events owned by another user or by a guest', () => {
    const log = [...buildOwnedLog(30, otherUserId), ...buildOwnedLog(30, null, 30)];
    expect(buildUploadBatches(log, userId)).toEqual([]);
  });

  it('splits a 1,000-event log into five batches of 200 that cover every event once, in order', () => {
    const log = buildOwnedLog(1000, userId);
    const batches = buildUploadBatches(log, userId);
    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 200, 200, 200]);
    expect(flatIds(batches)).toEqual(log.map(({ eventId }) => eventId));
  });

  it('puts the remainder in a short final batch', () => {
    const log = buildOwnedLog(450, userId);
    const batches = buildUploadBatches(log, userId);
    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 50]);
  });

  it('strips each event to the answer event fields', () => {
    const log = [toLogged(buildAnswerEvent(0), userId), toLogged(buildAnswerEvent(1), userId)];
    const [batch] = buildUploadBatches(log, userId);
    expect(batch).toEqual(log.map(stripToAnswerEvent));
    for (const event of batch) {
      expect(hasOnlyAnswerEventKeys(event)).toBe(true);
      expect(event).not.toHaveProperty('ownerUserId');
      expect(event).not.toHaveProperty('isSynced');
      expect(event).not.toHaveProperty('isHeld');
    }
  });

  it('returns no batches when nothing is left to upload', () => {
    const log = buildOwnedLog(5, userId).map((entry) => ({ ...entry, isSynced: true }));
    expect(buildUploadBatches(log, userId)).toEqual([]);
    expect(buildUploadBatches([], userId)).toEqual([]);
  });

  it('leaves the input log unchanged', () => {
    const log = buildOwnedLog(3, userId);
    const before = JSON.parse(JSON.stringify(log));
    buildUploadBatches(log, userId);
    expect(log).toEqual(before);
  });
});
