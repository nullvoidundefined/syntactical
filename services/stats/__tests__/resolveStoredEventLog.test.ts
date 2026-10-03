import AsyncStorage from '@react-native-async-storage/async-storage';

import { readStoredJson } from '../../../clients/readStoredJson';
import { EVENT_LOG_STORAGE_KEY, REJECTED_EVENT_LOG_STORAGE_KEY } from '../../../constants/appConfig';
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

async function readBackup(): Promise<unknown> {
  return JSON.parse((await AsyncStorage.getItem(REJECTED_EVENT_LOG_STORAGE_KEY)) ?? 'null');
}

describe('resolveStoredEventLog', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('keeps the well-formed entries and backs up only the malformed one', async () => {
    const good = [buildEntry('e-1'), buildEntry('e-2'), buildEntry('e-3')];
    const bad = { eventId: 7 };
    const { eventLog, isPersistenceBlocked } = await resolveStoredEventLog({ isReadFailed: false, value: [good[0], bad, good[1], good[2]] });
    expect(eventLog).toEqual(good);
    expect(isPersistenceBlocked).toBe(false);
    expect(await readBackup()).toEqual([bad]);
  });

  it('keeps an earlier backup when a later launch rejects another entry', async () => {
    await resolveStoredEventLog({ isReadFailed: false, value: [buildEntry('e-1'), { eventId: 'first-bad' }] });
    await resolveStoredEventLog({ isReadFailed: false, value: [buildEntry('e-1'), { eventId: 'second-bad', isSynced: 'x' }] });
    expect(await readBackup()).toEqual([{ eventId: 'first-bad' }, { eventId: 'second-bad', isSynced: 'x' }]);
  });

  it('backs up a rejected entry once across launches with no answer, and stores only the valid entries', async () => {
    const good = buildEntry('e-1');
    const bad = { eventId: 7 };
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([good, bad]));
    await resolveStoredEventLog(await readStoredJson(EVENT_LOG_STORAGE_KEY));
    const { eventLog } = await resolveStoredEventLog(await readStoredJson(EVENT_LOG_STORAGE_KEY));
    expect(eventLog).toEqual([good]);
    expect(await readBackup()).toEqual([bad]);
    expect(JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? 'null')).toEqual([good]);
  });

  it('keeps events in memory when the cleaned log cannot be written back', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockImplementation(async (key: string, value: string) => {
      if (key === EVENT_LOG_STORAGE_KEY) throw new Error('quota');
      (AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }).__INTERNAL_MOCK_STORAGE__[key] = value;
    });
    const { isPersistenceBlocked } = await resolveStoredEventLog({ isReadFailed: false, value: [buildEntry('e-1'), { eventId: 7 }] });
    expect(isPersistenceBlocked).toBe(true);
    expect(await readBackup()).toEqual([{ eventId: 7 }]);
  });

  it('backs up a stored value that is not a list at all and starts empty', async () => {
    const { eventLog } = await resolveStoredEventLog({ isReadFailed: false, value: 'not a list' });
    expect(eventLog).toEqual([]);
    expect(await readBackup()).toEqual(['not a list']);
  });

  it('keeps events in memory when the backup cannot be written', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    const { eventLog, isPersistenceBlocked } = await resolveStoredEventLog({ isReadFailed: false, value: [buildEntry('e-1'), { eventId: 7 }] });
    expect(eventLog.map(({ eventId }) => eventId)).toEqual(['e-1']);
    expect(isPersistenceBlocked).toBe(true);
  });
});
