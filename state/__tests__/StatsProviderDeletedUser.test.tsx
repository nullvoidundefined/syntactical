// B-59 (Task 3.21 client): once a deleted account is no longer the owner, StatsProvider removes
// that user's answer events (synced, unsynced, and held) and per-user stats key (the sync
// cursor lives there) from the device. Guest and other users' data stay. A plain sign-out
// (an owner change with no deleted id) keeps everything.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { buildUserStatsKey, STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import { buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { StatsProvider, useQuizStats } from '../StatsProvider';

import { flush, idsOf, readStoredLog, seedEventLog } from './syncTestSupport';

function Probe() {
  const { isHydrated } = useQuizStats();
  return <Text testID="hydrated">{String(isHydrated)}</Text>;
}

function Harness({ deletedUserId, ownerUserId }: { deletedUserId: string | null; ownerUserId: string | null }) {
  return (
    <StatsProvider deletedUserId={deletedUserId} ownerUserId={ownerUserId}>
      <Probe />
    </StatsProvider>
  );
}

async function seedDevice(userId: string, otherUserId: string) {
  const userEntries = [
    ...buildOwnedLog(2, userId),
    ...buildOwnedLog(1, userId, 10).map((entry) => ({ ...entry, isSynced: true })),
    ...buildOwnedLog(1, userId, 20).map((entry) => ({ ...entry, isHeld: true })),
  ];
  const keptEntries = [...buildOwnedLog(2, null, 30), ...buildOwnedLog(2, otherUserId, 40)];
  await seedEventLog([keptEntries[0], ...userEntries, ...keptEntries.slice(1)]);
  const stats = JSON.stringify({ ...createEmptyStats(readLocalToday()), syncCursor: 'cursor-1', syncCursorOwner: userId });
  await AsyncStorage.setItem(buildUserStatsKey(userId), stats);
  await AsyncStorage.setItem(buildUserStatsKey(otherUserId), stats);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptyStats(readLocalToday())));
  return { keptEntries, userEntries };
}

describe('StatsProvider with a deleted user', () => {
  let userId: string;
  let otherUserId: string;

  beforeEach(async () => {
    userId = randomUUID();
    otherUserId = randomUUID();
    await AsyncStorage.clear();
  });

  it('removes the deleted user\'s events and stats key once the owner changes, keeping guest and other users\' data', async () => {
    const { keptEntries } = await seedDevice(userId, otherUserId);
    const view = await render(<Harness deletedUserId={null} ownerUserId={userId} />);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));

    await view.rerender(<Harness deletedUserId={userId} ownerUserId={null} />);
    await flush();

    expect(idsOf(await readStoredLog()).sort()).toEqual(idsOf(keptEntries).sort());
    expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).toBeNull();
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).not.toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('keeps every event and the stats key on a plain sign-out', async () => {
    const { keptEntries, userEntries } = await seedDevice(userId, otherUserId);
    const view = await render(<Harness deletedUserId={null} ownerUserId={userId} />);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));

    await view.rerender(<Harness deletedUserId={null} ownerUserId={null} />);
    await flush();

    expect(idsOf(await readStoredLog()).sort()).toEqual(idsOf([...keptEntries, ...userEntries]).sort());
    expect(await AsyncStorage.getItem(buildUserStatsKey(userId))).not.toBeNull();
  });
});
