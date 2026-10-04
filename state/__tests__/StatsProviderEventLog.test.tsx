import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { StatsProvider, useQuizStats } from '../StatsProvider';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function EventProbe() {
  const { eventLog, isHydrated, recordAnswer } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="events">{eventLog.length}</Text>
      <Pressable
        testID="bank-answer"
        onPress={() =>
          recordAnswer({ choiceIndex: 2, difficulty: 'hard', language: 'postgres', questionId: 'pg-hard-07', roundKind: 'bank', wasCorrect: false })
        }
      />
      <Pressable
        testID="review-answer"
        onPress={() =>
          recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'review', wasCorrect: true })
        }
      />
    </>
  );
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]');
}

async function renderHydrated(ownerUserId?: string | null) {
  const view = await render(<StatsProvider ownerUserId={ownerUserId}><EventProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

describe('StatsProvider answer event log', () => {
  beforeEach(() => AsyncStorage.clear());

  it('appends exactly one event per recorded answer with a UUID v4 id, an ISO time, and its round kind', async () => {
    const before = Date.now();
    await renderHydrated();
    await fireEvent.press(screen.getByTestId('bank-answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(1));
    const [event] = await readStoredLog();
    expect(event).toEqual({
      answeredAt: expect.any(String),
      bankKey: 'postgres/hard',
      choiceIndex: 2,
      eventId: expect.stringMatching(UUID_V4),
      isCorrect: false,
      isHeld: false,
      isSynced: false,
      ownerUserId: null,
      questionId: 'pg-hard-07',
      roundKind: 'bank',
    });
    expect(new Date(event.answeredAt).toISOString()).toBe(event.answeredAt);
    expect(Date.parse(event.answeredAt)).toBeGreaterThanOrEqual(before);
    expect(screen.getByTestId('events')).toHaveTextContent('1');
  });

  it('gives every event its own id and records the review round kind', async () => {
    await renderHydrated();
    await fireEvent.press(screen.getByTestId('bank-answer'));
    await fireEvent.press(screen.getByTestId('review-answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(2));
    const [first, second] = await readStoredLog();
    expect(first.eventId).not.toBe(second.eventId);
    expect(second).toMatchObject({ bankKey: 'python/easy', isCorrect: true, roundKind: 'review' });
  });

  it('stamps the signed-in owner on each event', async () => {
    await renderHydrated('user-1');
    await fireEvent.press(screen.getByTestId('review-answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(1));
    expect((await readStoredLog())[0].ownerUserId).toBe('user-1');
  });

  it('loads a stored event log on hydrate and appends to it', async () => {
    const first = await renderHydrated();
    await fireEvent.press(screen.getByTestId('bank-answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(1));
    const stored = await readStoredLog();
    await first.unmount();
    await renderHydrated();
    expect(screen.getByTestId('events')).toHaveTextContent('1');
    await fireEvent.press(screen.getByTestId('review-answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(2));
    expect((await readStoredLog())[0]).toEqual(stored[0]);
  });

  it('drops a malformed stored event entry and stores only valid ones after the next answer', async () => {
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([{ eventId: 7 }]));
    await renderHydrated();
    expect(screen.getByTestId('events')).toHaveTextContent('0');
    await fireEvent.press(screen.getByTestId('bank-answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(1));
    expect((await readStoredLog())[0]).toMatchObject({ eventId: expect.stringMatching(UUID_V4) });
  });
});
