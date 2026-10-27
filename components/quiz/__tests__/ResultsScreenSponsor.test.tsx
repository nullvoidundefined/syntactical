// components/quiz/__tests__/ResultsScreenSponsor.test.tsx
// The results screen decides on its first render, from the cadence read when the round started, whether a
// sponsored card is due, so the card's slot is there from the first frame and never pops in later. It
// shows the card after the Retry and Menu row only after a bank round, counts every finished round, and
// resets the count once the card reports itself shown. An empty round is not counted.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';

import { settle } from '../../../config/settle';
import { SPONSOR_CADENCE_STORAGE_KEY } from '../../../constants/appConfig';
import type { SponsorCadence } from '../../../services/sponsor/sponsorCadence';
import { ResultsScreen } from '../ResultsScreen';

jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));
// The card itself (eligibility, the slot, the feeds) is covered in components/sponsor; this stand-in reports
// itself shown, as the real one does for a user who may see cards.
jest.mock('../../sponsor/SponsoredCard', () => {
  const { useEffect } = require('react');
  const { Text } = require('react-native');
  return {
    SponsoredCard: ({ onShown, placement }: { onShown?: () => void; placement: string }) => {
      useEffect(() => onShown?.(), [onShown]);
      return <Text>{`sponsored ${placement}`}</Text>;
    },
  };
});

const DUE: SponsorCadence = { completedRounds: 2, roundsSinceLastCard: 2 };
const NOT_DUE: SponsorCadence = { completedRounds: 1, roundsSinceLastCard: 1 };

async function seed({ completedRounds, roundsSinceLastCard }: SponsorCadence) {
  await AsyncStorage.setItem(SPONSOR_CADENCE_STORAGE_KEY, JSON.stringify({ completedRounds, roundsSinceLastCard }));
}

async function readStored() {
  return JSON.parse((await AsyncStorage.getItem(SPONSOR_CADENCE_STORAGE_KEY)) ?? 'null');
}

type ResultsOptions = {
  cadenceAtStart?: SponsorCadence | null;
  roundKind?: 'bank' | 'review';
  totalQuestions?: number;
};

function buildResults({ cadenceAtStart, roundKind, totalQuestions = 2 }: ResultsOptions) {
  return (
    <ResultsScreen
      accuracy={50}
      correctCount={1}
      totalQuestions={totalQuestions}
      languageLabel="Python"
      difficultyLabel="Easy"
      onMenu={jest.fn()}
      onRetry={jest.fn()}
      {...(cadenceAtStart === undefined ? {} : { cadenceAtStart })}
      {...(roundKind ? { roundKind } : {})}
    />
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('ResultsScreen sponsored card', () => {
  it('renders the card in its first render when the round makes it due, after Retry and Menu, and resets the count', async () => {
    await seed(DUE);
    await render(buildResults({ cadenceAtStart: DUE }));
    expect(screen.getByText('sponsored results')).toBeTruthy();
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Menu')).toBeLessThan(tree.indexOf('sponsored results'));
    await settle();
    expect(await readStored()).toEqual({ completedRounds: 3, roundsSinceLastCard: 0 });
  });

  it('shows no card before it is due, and counts the round', async () => {
    await seed(NOT_DUE);
    await render(buildResults({ cadenceAtStart: NOT_DUE }));
    await settle();
    expect(screen.queryByText('sponsored results')).toBeNull();
    expect(await readStored()).toEqual({ completedRounds: 2, roundsSinceLastCard: 2 });
  });

  it('never shows the card after a review round, but counts it', async () => {
    await seed(DUE);
    await render(buildResults({ cadenceAtStart: DUE, roundKind: 'review' }));
    await settle();
    expect(screen.queryByText('sponsored results')).toBeNull();
    expect(await readStored()).toEqual({ completedRounds: 3, roundsSinceLastCard: 3 });
  });

  it('shows no card when the cadence was not read at the start, and still counts the round', async () => {
    await seed(DUE);
    await render(buildResults({ cadenceAtStart: null }));
    await settle();
    expect(screen.queryByText('sponsored results')).toBeNull();
    expect(await readStored()).toEqual({ completedRounds: 3, roundsSinceLastCard: 3 });
  });

  it('never brings a card in after the first render', async () => {
    await seed(DUE);
    const view = await render(buildResults({}));
    await view.rerender(buildResults({ cadenceAtStart: DUE }));
    await settle();
    expect(screen.queryByText('sponsored results')).toBeNull();
  });

  it('does not count a round with no questions', async () => {
    await seed(DUE);
    await render(buildResults({ cadenceAtStart: DUE, roundKind: 'bank', totalQuestions: 0 }));
    await settle();
    expect(screen.queryByText('sponsored results')).toBeNull();
    expect(await readStored()).toEqual({ completedRounds: 2, roundsSinceLastCard: 2 });
  });
});
