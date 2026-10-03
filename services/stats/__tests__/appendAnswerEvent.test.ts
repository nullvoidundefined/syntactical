import { EVENT_LOG_CAP } from '../../../constants/appConfig';
import { appendAnswerEvent } from '../appendAnswerEvent';
import type { LoggedAnswerEvent } from '../types/LoggedAnswerEvent';

function buildLogged(index: number, isSynced: boolean): LoggedAnswerEvent {
  return {
    answeredAt: new Date(Date.UTC(2026, 9, 1) + index * 1000).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: 0,
    eventId: `event-${index}`,
    isCorrect: true,
    isHeld: false,
    isSynced,
    ownerUserId: null,
    questionId: `question-${index}`,
    roundKind: 'bank',
  };
}

function buildLog(count: number, isSynced: (index: number) => boolean): LoggedAnswerEvent[] {
  return Array.from({ length: count }, (_unused, index) => buildLogged(index, isSynced(index)));
}

describe('appendAnswerEvent', () => {
  it('caps the log at 5,000 entries', () => {
    expect(EVENT_LOG_CAP).toBe(5000);
  });

  it('appends the new event at the end without changing the input log', () => {
    const log = buildLog(2, () => false);
    const next = appendAnswerEvent(log, buildLogged(2, false));
    expect(next.map(({ eventId }) => eventId)).toEqual(['event-0', 'event-1', 'event-2']);
    expect(log).toHaveLength(2);
  });

  it('trims the oldest synced entry once the log is full', () => {
    const log = buildLog(EVENT_LOG_CAP, () => true);
    const next = appendAnswerEvent(log, buildLogged(EVENT_LOG_CAP, false));
    expect(next).toHaveLength(EVENT_LOG_CAP);
    expect(next[0].eventId).toBe('event-1');
    expect(next[next.length - 1].eventId).toBe(`event-${EVENT_LOG_CAP}`);
  });

  it('skips unsynced entries and trims the oldest synced one', () => {
    const log = buildLog(EVENT_LOG_CAP, (index) => index >= 3);
    const next = appendAnswerEvent(log, buildLogged(EVENT_LOG_CAP, false));
    const ids = next.map(({ eventId }) => eventId);
    expect(next).toHaveLength(EVENT_LOG_CAP);
    expect(ids.slice(0, 4)).toEqual(['event-0', 'event-1', 'event-2', 'event-4']);
  });

  it('drops the oldest unsynced entry once no synced entry is left to trim, so the log never exceeds the cap', () => {
    const log = buildLog(EVENT_LOG_CAP, () => false);
    const next = appendAnswerEvent(log, buildLogged(EVENT_LOG_CAP, false));
    expect(next).toHaveLength(EVENT_LOG_CAP);
    expect(next[0].eventId).toBe('event-1');
    expect(next[next.length - 1].eventId).toBe(`event-${EVENT_LOG_CAP}`);
  });

  it('trims synced entries before any unsynced one when both are needed', () => {
    const log = buildLog(EVENT_LOG_CAP + 1, (index) => index === 2);
    const next = appendAnswerEvent(log, buildLogged(EVENT_LOG_CAP + 1, false));
    const ids = next.map(({ eventId }) => eventId);
    expect(next).toHaveLength(EVENT_LOG_CAP);
    expect(ids).not.toContain('event-2');
    expect(ids.slice(0, 2)).toEqual(['event-1', 'event-3']);
    expect(ids[ids.length - 1]).toBe(`event-${EVENT_LOG_CAP + 1}`);
  });
});
