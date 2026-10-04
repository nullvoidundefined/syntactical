import { randomUUID } from 'node:crypto';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { buildUploadBatches } from '../buildUploadBatches';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { buildAnswerEvent, stripToAnswerEvent, toLogged } from './fakeSyncServer';

const userId = randomUUID();
const otherUserId = randomUUID();

function entriesWithId(log: LoggedAnswerEvent[], eventId: string): LoggedAnswerEvent[] {
  return log.filter((entry) => entry.eventId === eventId);
}

describe('mergeDownloadedEvents ownership', () => {
  it.each([
    ['a guest', null],
    ['another user', otherUserId],
  ])('leaves an entry owned by %s untouched when a downloaded event shares its id', (_label, ownerUserId) => {
    const foreign = toLogged(buildAnswerEvent(0), ownerUserId);
    const own = toLogged(buildAnswerEvent(1), userId);
    const fresh = buildAnswerEvent(2);

    const next = mergeDownloadedEvents([foreign, own], [stripToAnswerEvent(foreign), fresh], userId);

    expect(entriesWithId(next, foreign.eventId)).toEqual([foreign]);
    expect(entriesWithId(next, fresh.eventId)).toEqual([{ ...fresh, isHeld: false, isSynced: true, ownerUserId: userId }]);
    expect(entriesWithId(next, own.eventId)).toEqual([own]);
  });

  it('marks a held entry of the same user synced and no longer held, so it is not uploaded again', () => {
    const held = toLogged(buildAnswerEvent(0), userId, { isHeld: true });
    const pending = toLogged(buildAnswerEvent(1), userId);

    const next = mergeDownloadedEvents([held, pending], [stripToAnswerEvent(held)], userId);

    expect(entriesWithId(next, held.eventId)).toEqual([{ ...held, isHeld: false, isSynced: true }]);
    expect(buildUploadBatches(next, userId).flat().map(({ eventId }) => eventId)).toEqual([pending.eventId]);
  });
});
