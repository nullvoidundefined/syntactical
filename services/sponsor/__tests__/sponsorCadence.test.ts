// services/sponsor/__tests__/sponsorCadence.test.ts
// The results card cadence: a card is due once 3 rounds have completed since the last card (or since the
// first launch), so the first lands on the third round and then every third round. A malformed stored value
// counts from zero; a failed read shows no card and writes nothing. A round reads the cadence when it starts,
// after any write still pending from the round before.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SPONSOR_CADENCE_STORAGE_KEY } from '../../../constants/appConfig';
import {
  countRound,
  readSponsorCadence,
  recordCardShown,
  recordRoundCompleted,
  shouldShowResultsCard,
} from '../sponsorCadence';

async function readStored(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(SPONSOR_CADENCE_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => AsyncStorage.clear());

describe('shouldShowResultsCard', () => {
  it.each([
    [0, 0, false],
    [1, 1, false],
    [2, 2, false],
    [3, 3, true],
    [6, 2, false],
    [6, 3, true],
    [40, 7, true],
  ])('completed %i, since last card %i: %s', (completedRounds, roundsSinceLastCard, isDue) => {
    expect(shouldShowResultsCard({ completedRounds, roundsSinceLastCard })).toBe(isDue);
  });
});

describe('countRound', () => {
  it('adds one to both counters, as a finished round stores them', () => {
    expect(countRound({ completedRounds: 2, roundsSinceLastCard: 2 })).toEqual({
      completedRounds: 3,
      roundsSinceLastCard: 3,
    });
  });
});

describe('readSponsorCadence', () => {
  it('reads zero when nothing is stored or the value is malformed', async () => {
    expect(await readSponsorCadence()).toEqual({ completedRounds: 0, roundsSinceLastCard: 0 });
    await AsyncStorage.setItem(SPONSOR_CADENCE_STORAGE_KEY, '"oops"');
    expect(await readSponsorCadence()).toEqual({ completedRounds: 0, roundsSinceLastCard: 0 });
  });

  it('sees a write still pending from the round before', async () => {
    void recordRoundCompleted();
    expect(await readSponsorCadence()).toEqual({ completedRounds: 1, roundsSinceLastCard: 1 });
  });

  it('returns null when the read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await readSponsorCadence()).toBeNull();
    warn.mockRestore();
  });
});

describe('recording rounds and cards', () => {
  it('counts a first round from nothing stored and stores it', async () => {
    expect(await recordRoundCompleted()).toEqual({ completedRounds: 1, roundsSinceLastCard: 1 });
    expect(await readStored()).toEqual({ completedRounds: 1, roundsSinceLastCard: 1 });
  });

  it('makes the third round due, and after the card the sixth', async () => {
    const due: boolean[] = [];
    for (let round = 1; round <= 6; round += 1) {
      const cadence = await recordRoundCompleted();
      const isDue = cadence !== null && shouldShowResultsCard(cadence);
      due.push(isDue);
      if (isDue) await recordCardShown();
    }
    expect(due).toEqual([false, false, true, false, false, true]);
    expect(await readStored()).toEqual({ completedRounds: 6, roundsSinceLastCard: 0 });
  });

  it('loses no count when two rounds are recorded at once', async () => {
    await Promise.all([recordRoundCompleted(), recordRoundCompleted()]);
    expect(await readStored()).toEqual({ completedRounds: 2, roundsSinceLastCard: 2 });
  });

  it.each([['"oops"'], ['{"completedRounds":-1,"roundsSinceLastCard":0}'], ['{"completedRounds":1.5}'], ['[]']])(
    'counts from zero when the stored value is %s',
    async (raw) => {
      await AsyncStorage.setItem(SPONSOR_CADENCE_STORAGE_KEY, raw);
      expect(await recordRoundCompleted()).toEqual({ completedRounds: 1, roundsSinceLastCard: 1 });
    },
  );

  it('returns null and writes nothing when the read fails', async () => {
    await AsyncStorage.setItem(SPONSOR_CADENCE_STORAGE_KEY, '{"completedRounds":2,"roundsSinceLastCard":2}');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    expect(await recordRoundCompleted()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
