import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { StatsProvider, useQuizStats } from '../StatsProvider';

jest.mock('../../clients/uuidClient', () => ({
  generateUuid: () => {
    throw new Error('crypto.randomUUID is unavailable on an insecure origin');
  },
}));

function AnswerProbe() {
  const { eventLog, isHydrated, recordAnswer, stats } = useQuizStats();
  function answerSafely() {
    try {
      recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true });
    } catch (err) {
      console.warn(String(err));
    }
  }
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Text testID="events">{eventLog.length}</Text>
      <Pressable testID="answer" onPress={answerSafely} />
    </>
  );
}

describe('StatsProvider when the event id cannot be generated', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('changes neither the stats nor the event log', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    await render(<StatsProvider><AnswerProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await fireEvent.press(screen.getByTestId('answer'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('attempted')).toHaveTextContent('0');
    expect(screen.getByTestId('events')).toHaveTextContent('0');
    expect(setItem).not.toHaveBeenCalled();
  });
});
