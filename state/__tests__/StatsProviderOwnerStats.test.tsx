import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { DEFAULT_DAILY_GOAL, STORAGE_KEY } from '../../constants/appConfig';
import type { Stats } from '../../services/stats/types/Stats';
import { StatsProvider, useQuizStats } from '../StatsProvider';

// The guest's stored stats: every owner-scoped field differs from a fresh
// owner's empty stats, so a leak of any one of them shows.
const guestStats: Stats = {
  answerStreak: { best: 6, current: 4 },
  goalHistory: [{ from: '2026-09-01', goal: 50 }],
  isSignUpPromptDismissed: true,
  totals: { attempted: 9, correct: 7 },
  tracks: { 'python:easy': { attempted: 9, completions: 3, correct: 7 } },
  version: 2,
};

// The user the probe's claim button claims the guest log for.
let probeClaimUserId = '';

function StatsProbe() {
  const { claimGuestEvents, isHydrated, recordAnswer, recordCompletion, stats } = useQuizStats();
  const track = stats.tracks['python:easy'] ?? { attempted: 0, completions: 0, correct: 0 };
  const lastGoal = stats.goalHistory[stats.goalHistory.length - 1];
  function answer(wasCorrect: boolean) {
    recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect });
  }
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="totals">{`${stats.totals.correct}/${stats.totals.attempted}`}</Text>
      <Text testID="track">{`${track.correct}/${track.attempted} rounds ${track.completions}`}</Text>
      <Text testID="streak">{`${stats.answerStreak.current}/${stats.answerStreak.best}`}</Text>
      <Text testID="goal">{String(lastGoal?.goal)}</Text>
      <Text testID="dismissed">{String(stats.isSignUpPromptDismissed)}</Text>
      <Pressable testID="right" onPress={() => answer(true)} />
      <Pressable testID="wrong" onPress={() => answer(false)} />
      <Pressable testID="complete" onPress={() => recordCompletion({ difficulty: 'easy', language: 'python' })} />
      <Pressable testID="claim" onPress={() => void claimGuestEvents(probeClaimUserId)} />
    </>
  );
}

function renderProvider(ownerUserId: string | null) {
  return <StatsProvider ownerUserId={ownerUserId}><StatsProbe /></StatsProvider>;
}

// Waits for hydration, then lets any pending storage read for the new owner settle.
async function settle() {
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function readGuestKey(): Promise<Stats> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null');
}

function expectEmptyStats() {
  expect(screen.getByTestId('totals')).toHaveTextContent('0/0');
  expect(screen.getByTestId('track')).toHaveTextContent('0/0 rounds 0');
  expect(screen.getByTestId('streak')).toHaveTextContent('0/0');
  expect(screen.getByTestId('goal')).toHaveTextContent(String(DEFAULT_DAILY_GOAL));
  expect(screen.getByTestId('dismissed')).toHaveTextContent('false');
}

function expectGuestStats() {
  expect(screen.getByTestId('totals')).toHaveTextContent('7/9');
  expect(screen.getByTestId('track')).toHaveTextContent('7/9 rounds 3');
  expect(screen.getByTestId('streak')).toHaveTextContent('4/6');
  expect(screen.getByTestId('goal')).toHaveTextContent('50');
  expect(screen.getByTestId('dismissed')).toHaveTextContent('true');
}

// User A's activity in these tests: two right answers, one completed round.
function expectUserAStats() {
  expect(screen.getByTestId('totals')).toHaveTextContent('2/2');
  expect(screen.getByTestId('track')).toHaveTextContent('2/2 rounds 1');
  expect(screen.getByTestId('streak')).toHaveTextContent('2/2');
}

async function playAsUserA() {
  await fireEvent.press(screen.getByTestId('right'));
  await fireEvent.press(screen.getByTestId('right'));
  await fireEvent.press(screen.getByTestId('complete'));
  await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('2/2'));
}

describe('StatsProvider owner-scoped stats', () => {
  const userA = randomUUID();
  const userB = randomUUID();

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(guestStats));
  });

  it('shows a signed-in user who has not claimed the guest log none of the guest\'s stats', async () => {
    await render(renderProvider(userA));
    await settle();
    await waitFor(() => expectEmptyStats());
  });

  it('shows the guest none of user A\'s totals, track accuracy, answer streak, or completions after A signs out', async () => {
    const view = await render(renderProvider(userA));
    await settle();
    await playAsUserA();
    await view.rerender(renderProvider(null));
    await settle();
    await waitFor(() => expectGuestStats());
  });

  it('shows user B none of user A\'s counts and never adds B\'s answers to A\'s counts', async () => {
    const view = await render(renderProvider(userA));
    await settle();
    await playAsUserA();
    await view.rerender(renderProvider(null));
    await settle();
    await view.rerender(renderProvider(userB));
    await settle();
    await waitFor(() => expectEmptyStats());
    await fireEvent.press(screen.getByTestId('wrong'));
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('0/1'));
    expect(screen.getByTestId('track')).toHaveTextContent('0/1 rounds 0');
    expect(screen.getByTestId('streak')).toHaveTextContent('0/0');
    await view.rerender(renderProvider(userA));
    await settle();
    await waitFor(() => expectUserAStats());
  });

  it('restores user A\'s stats after a remount and keeps them apart from user B\'s', async () => {
    const view = await render(renderProvider(userA));
    await settle();
    await playAsUserA();
    await view.rerender(renderProvider(userB));
    await settle();
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('0/0'));
    await fireEvent.press(screen.getByTestId('wrong'));
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('0/1'));
    await settle();
    await view.unmount();

    await render(renderProvider(userA));
    await settle();
    await waitFor(() => expectUserAStats());
  });

  it('keeps the guest\'s stats unchanged under the existing stats key while signed-in users record answers', async () => {
    const view = await render(renderProvider(userA));
    await settle();
    await playAsUserA();
    await view.rerender(renderProvider(userB));
    await settle();
    await fireEvent.press(screen.getByTestId('wrong'));
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('0/1'));
    await settle();
    expect(await readGuestKey()).toEqual(guestStats);
  });

  it('carries the guest\'s stats over to the user who claims the guest log, and leaves the guest empty', async () => {
    probeClaimUserId = userA;
    const view = await render(renderProvider(userA));
    await settle();
    await fireEvent.press(screen.getByTestId('claim'));
    await waitFor(() => expectGuestStats());
    await fireEvent.press(screen.getByTestId('right'));
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('8/10'));
    await settle();
    await view.rerender(renderProvider(null));
    await settle();
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('0/0'));
    expect(screen.getByTestId('track')).toHaveTextContent('0/0 rounds 0');
    expect(screen.getByTestId('streak')).toHaveTextContent('0/0');
    await view.unmount();

    await render(renderProvider(userA));
    await settle();
    await waitFor(() => expect(screen.getByTestId('totals')).toHaveTextContent('8/10'));
    expect(screen.getByTestId('track')).toHaveTextContent('8/10 rounds 3');
    expect(screen.getByTestId('streak')).toHaveTextContent('5/6');
    expect(screen.getByTestId('goal')).toHaveTextContent('50');
    expect(screen.getByTestId('dismissed')).toHaveTextContent('true');
  });
});
