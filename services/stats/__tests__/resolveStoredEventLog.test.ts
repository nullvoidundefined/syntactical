import { resolveStoredEventLog } from '../resolveStoredEventLog';
import type { LoggedAnswerEvent } from '../types/LoggedAnswerEvent';

function buildEntry(eventId: string): LoggedAnswerEvent {
  return {
    answeredAt: '2026-10-01T10:00:00.000Z',
    bankKey: 'python/easy',
    choiceIndex: 1,
    eventId,
    isCorrect: false,
    isHeld: false,
    isSynced: false,
    ownerUserId: null,
    questionId: 'py-easy-01',
    roundKind: 'bank',
  };
}

describe('resolveStoredEventLog', () => {
  it('keeps the well-formed entries and drops the malformed one', () => {
    const good = [buildEntry('e-1'), buildEntry('e-2'), buildEntry('e-3')];
    const { eventLog, isPersistenceBlocked } = resolveStoredEventLog({ isReadFailed: false, value: [good[0], { eventId: 7 }, good[1], good[2]] });
    expect(eventLog).toEqual(good);
    expect(isPersistenceBlocked).toBe(false);
  });

  it('starts empty for a stored value that is not a list', () => {
    expect(resolveStoredEventLog({ isReadFailed: false, value: 'not a list' })).toEqual({ eventLog: [], isPersistenceBlocked: false });
  });

  it('starts empty and unblocked when nothing is stored', () => {
    expect(resolveStoredEventLog({ isReadFailed: false, value: null })).toEqual({ eventLog: [], isPersistenceBlocked: false });
  });

  it('starts empty and blocks persistence when the read failed, so stored events are never overwritten', () => {
    expect(resolveStoredEventLog({ isReadFailed: true, value: null })).toEqual({ eventLog: [], isPersistenceBlocked: true });
  });
});
