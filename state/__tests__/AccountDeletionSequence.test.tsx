// B-59 (client half), slice B-59a2: the account-deletion local cleanup run
// back to back in the real provider tree. With AuthProvider wrapping
// StatsProvider exactly as app/_layout.tsx wires it, awaiting signOutLocally()
// and then at once deleteLocalUserData(userId) resolves and removes that
// user's events and stats key, because signOutLocally resolves only after the
// signed-out identity is committed to the tree. Its guards: a call before the
// stored event log has loaded rejects and leaves the stored log as it was, a
// guest stats load still in flight does not make it reject, a failed stats key
// removal rejects and a retry after storage recovers succeeds, and a failed
// event log write rejects with the stats key still stored.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerEvent } from '@syntactical/progress';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../services/stats/types/Stats';
import { AuthProvider, useAuth } from '../AuthProvider';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { AUTH_STORAGE_KEY, SESSION_TOKEN_KEY, buildIdentity, readStoredAuth } from './authTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    mockValues: values,
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  };
});

const secureStore = jest.requireMock('expo-secure-store') as { mockValues: Map<string, string> };

type AuthValue = ReturnType<typeof useAuth>;
type StatsValue = ReturnType<typeof useQuizStats>;

let latestAuth: AuthValue;
let latestStats: StatsValue;

function StatsProbe() {
  const value = useQuizStats();
  latestStats = value;
  return (
    <>
      <Text testID="hydrated">{String(value.isHydrated)}</Text>
      <Text testID="events">{value.eventLog.length}</Text>
    </>
  );
}

function AuthAndStatsProbe() {
  const auth = useAuth();
  latestAuth = auth;
  return (
    <>
      <Text testID="user">{auth.user?.id ?? 'guest'}</Text>
      <StatsProbe />
    </>
  );
}

// The wiring of app/_layout.tsx: stats belong to the signed-in user.
function OwnedStatsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

let eventIndex = 0;

function buildAnswerEvent(): AnswerEvent {
  eventIndex += 1;
  return {
    answeredAt: new Date(Date.UTC(2026, 9, 1, 12) + eventIndex * 1000).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: eventIndex % 4,
    eventId: randomUUID(),
    isCorrect: eventIndex % 2 === 0,
    questionId: `question-${eventIndex}`,
    roundKind: 'bank',
  };
}

function buildEntry(ownerUserId: string | null, flags: { isHeld?: boolean; isSynced?: boolean } = {}): LoggedAnswerEvent {
  return { ...buildAnswerEvent(), isHeld: flags.isHeld ?? false, isSynced: flags.isSynced ?? false, ownerUserId };
}

function buildStats(attempted: number, cursorOwner?: string): Stats {
  const empty = createEmptyStats(readLocalToday());
  const stats: Stats = { ...empty, totals: { ...empty.totals, attempted, correct: attempted } };
  if (cursorOwner === undefined) return stats;
  return { ...stats, syncCursor: `cursor-${randomUUID()}`, syncCursorOwner: cursorOwner };
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]') as LoggedAnswerEvent[];
}

type Seeded = {
  deletedUserStatsText: string;
  guestStatsText: string;
  log: LoggedAnswerEvent[];
  otherUserStatsText: string;
  survivingLog: LoggedAnswerEvent[];
};

// A device holding a guest, the user being deleted, and another user, with the
// deleted user's entries in every sync state, interleaved with the rest.
async function seedDevice(deletedUserId: string, otherUserId: string): Promise<Seeded> {
  const guestOne = buildEntry(null);
  const unsyncedDeleted = buildEntry(deletedUserId);
  const otherUnsynced = buildEntry(otherUserId);
  const syncedDeleted = buildEntry(deletedUserId, { isSynced: true });
  const guestTwo = buildEntry(null, { isSynced: true });
  const heldDeleted = buildEntry(deletedUserId, { isHeld: true });
  const otherSynced = buildEntry(otherUserId, { isSynced: true });
  const log = [guestOne, unsyncedDeleted, otherUnsynced, syncedDeleted, guestTwo, heldDeleted, otherSynced];
  await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(log));
  const guestStatsText = JSON.stringify(buildStats(2));
  const otherUserStatsText = JSON.stringify(buildStats(5, otherUserId));
  const deletedUserStatsText = JSON.stringify(buildStats(3, deletedUserId));
  await AsyncStorage.setItem(STORAGE_KEY, guestStatsText);
  await AsyncStorage.setItem(buildUserStatsKey(otherUserId), otherUserStatsText);
  await AsyncStorage.setItem(buildUserStatsKey(deletedUserId), deletedUserStatsText);
  return {
    deletedUserStatsText,
    guestStatsText,
    log,
    otherUserStatsText,
    survivingLog: [guestOne, otherUnsynced, guestTwo, otherSynced],
  };
}

async function settle(rounds = 30): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}

type Outcome = { isResolved: true } | { isResolved: false; error: unknown };

async function outcomeOf(work: () => Promise<unknown>): Promise<Outcome> {
  try {
    await work();
    return { isResolved: true };
  } catch (error) {
    return { error, isResolved: false };
  }
}

function errorOf(outcome: Outcome): unknown {
  return outcome.isResolved ? null : outcome.error;
}

// Runs the steps as the app does on a device: no test act() scope batches or
// flushes React work, so renders and effects happen only as React schedules them.
async function runAsOnDevice(work: () => Promise<unknown>): Promise<Outcome> {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const wasActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    return await outcomeOf(work);
  } finally {
    environment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
  }
}

const getItemMock = AsyncStorage.getItem as unknown as jest.Mock;
const setItemMock = AsyncStorage.setItem as unknown as jest.Mock;
const removeItemMock = AsyncStorage.removeItem as unknown as jest.Mock;
const originalGetItem = getItemMock.getMockImplementation();
const originalSetItem = setItemMock.getMockImplementation();
const originalRemoveItem = removeItemMock.getMockImplementation();

function restoreStorage(): void {
  getItemMock.mockImplementation(originalGetItem);
  setItemMock.mockImplementation(originalSetItem);
  removeItemMock.mockImplementation(originalRemoveItem);
}

// The next read of this key waits until released.
function holdNextRead(heldKey: string): { isReached: () => boolean; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let isReached = false;
  getItemMock.mockImplementation(async (key: string, ...rest: unknown[]) => {
    if (key === heldKey && !isReached) {
      isReached = true;
      await gate;
    }
    return originalGetItem?.(key, ...rest);
  });
  return { isReached: () => isReached, release: () => release() };
}

describe('account deletion local cleanup in the app provider tree', () => {
  let deletedUserId: string;
  let otherUserId: string;

  beforeEach(async () => {
    restoreStorage();
    await AsyncStorage.clear();
    secureStore.mockValues.clear();
    const identity = buildIdentity();
    deletedUserId = identity.userId;
    otherUserId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [deletedUserId], userId: deletedUserId }));
    secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
  });

  afterEach(() => {
    restoreStorage();
    jest.restoreAllMocks();
  });

  async function renderSignedInApp(seeded: Seeded) {
    const view = await render(
      <AuthProvider>
        <OwnedStatsProvider>
          <AuthAndStatsProbe />
        </OwnedStatsProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(deletedUserId));
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    expect(latestStats.eventLog).toHaveLength(seeded.log.length - seeded.survivingLog.length);
    return view;
  }

  async function expectUserDataGone(seeded: Seeded): Promise<void> {
    await settle();
    expect(await readStoredLog()).toEqual(seeded.survivingLog);
    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBeNull();
    expect(await AsyncStorage.getAllKeys()).not.toContain(buildUserStatsKey(deletedUserId));
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(seeded.guestStatsText);
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(seeded.otherUserStatsText);
    expect(await readStoredAuth()).toMatchObject({ userId: null });
    expect(screen.getByTestId('user')).toHaveTextContent('guest');
  }

  it('resolves when signOutLocally and then deleteLocalUserData run back to back with the functions captured before sign-out', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderSignedInApp(seeded);
    const { signOutLocally } = latestAuth;
    const { deleteLocalUserData } = latestStats;

    const outcome = await runAsOnDevice(async () => {
      await signOutLocally();
      await deleteLocalUserData(deletedUserId);
    });

    expect(outcome).toEqual({ isResolved: true });
    await expectUserDataGone(seeded);
  });

  it('resolves when deleteLocalUserData is re-read from the stats context right after signOutLocally resolves', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderSignedInApp(seeded);

    const outcome = await runAsOnDevice(async () => {
      await latestAuth.signOutLocally();
      await latestStats.deleteLocalUserData(deletedUserId);
    });

    expect(outcome).toEqual({ isResolved: true });
    await expectUserDataGone(seeded);
  });

  it('resolves while the guest stats key is still loading after sign-out, with the read released only once the call has started', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderSignedInApp(seeded);
    const guestRead = holdNextRead(STORAGE_KEY);

    const outcome = await runAsOnDevice(async () => {
      await latestAuth.signOutLocally();
      const deletion = latestStats.deleteLocalUserData(deletedUserId);
      // The guest stats load the sign-out started cannot have finished yet.
      guestRead.release();
      await deletion;
    });

    expect(outcome).toEqual({ isResolved: true });
    await expectUserDataGone(seeded);
  });
});

describe('deleteLocalUserData guards', () => {
  let deletedUserId: string;
  let otherUserId: string;

  beforeEach(async () => {
    restoreStorage();
    await AsyncStorage.clear();
    deletedUserId = randomUUID();
    otherUserId = randomUUID();
  });

  afterEach(() => {
    restoreStorage();
    jest.restoreAllMocks();
  });

  async function renderStats(ownerUserId: string | null) {
    return render(
      <StatsProvider ownerUserId={ownerUserId}>
        <StatsProbe />
      </StatsProvider>,
    );
  }

  it('rejects when called before the stored event log has loaded and leaves the stored log unchanged', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    const logRead = holdNextRead(EVENT_LOG_STORAGE_KEY);
    await renderStats(null);
    await waitFor(() => expect(logRead.isReached()).toBe(true));

    let outcome: Outcome = { isResolved: true };
    await act(async () => {
      outcome = await outcomeOf(() => latestStats.deleteLocalUserData(deletedUserId));
    });
    await act(async () => logRead.release());
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await settle();

    expect(outcome.isResolved).toBe(false);
    expect(errorOf(outcome)).toBeInstanceOf(Error);
    expect(await readStoredLog()).toEqual(seeded.log);
    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBe(seeded.deletedUserStatsText);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(seeded.guestStatsText);
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(seeded.otherUserStatsText);
  });

  it('does not reject because the guest stats key is still loading once the event log has loaded', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    const guestRead = holdNextRead(STORAGE_KEY);
    await renderStats(null);
    await waitFor(() => expect(guestRead.isReached()).toBe(true));
    // The event log is loaded: the guest's two entries are visible.
    await waitFor(() => expect(screen.getByTestId('events')).toHaveTextContent('2'));
    expect(screen.getByTestId('hydrated')).toHaveTextContent('false');

    let deletion: Promise<Outcome> = Promise.resolve({ isResolved: true });
    await act(async () => {
      deletion = outcomeOf(() => latestStats.deleteLocalUserData(deletedUserId));
    });
    await act(async () => guestRead.release());
    let outcome: Outcome = { isResolved: false, error: null };
    await act(async () => {
      outcome = await deletion;
    });
    await settle();

    expect(outcome).toEqual({ isResolved: true });
    expect(await readStoredLog()).toEqual(seeded.survivingLog);
    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(seeded.guestStatsText);
  });

  it('rejects when the stats key removal fails, and a second call after storage recovers resolves and removes the key', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderStats(null);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const deletedKey = buildUserStatsKey(deletedUserId);
    let isStorageFailing = true;
    removeItemMock.mockImplementation((key: string, ...rest: unknown[]) => {
      if (key === deletedKey && isStorageFailing) return Promise.reject(new Error('storage unavailable'));
      return originalRemoveItem?.(key, ...rest);
    });

    let first: Outcome = { isResolved: true };
    await act(async () => {
      first = await outcomeOf(() => latestStats.deleteLocalUserData(deletedUserId));
    });
    await settle();

    expect(first.isResolved).toBe(false);
    expect(errorOf(first)).toBeInstanceOf(Error);

    isStorageFailing = false;
    let second: Outcome = { isResolved: false, error: null };
    await act(async () => {
      second = await outcomeOf(() => latestStats.deleteLocalUserData(deletedUserId));
    });
    await settle();

    expect(second).toEqual({ isResolved: true });
    expect(await AsyncStorage.getItem(deletedKey)).toBeNull();
    expect(await AsyncStorage.getAllKeys()).not.toContain(deletedKey);
    expect(await readStoredLog()).toEqual(seeded.survivingLog);
  });

  it('rejects when the event log write fails and leaves the deleted user\'s stats key stored', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderStats(null);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setItemMock.mockImplementation(async (key: string, ...rest: unknown[]) => {
      if (key === EVENT_LOG_STORAGE_KEY) throw new Error('storage full');
      return originalSetItem?.(key, ...rest);
    });

    let outcome: Outcome = { isResolved: true };
    await act(async () => {
      outcome = await outcomeOf(() => latestStats.deleteLocalUserData(deletedUserId));
    });
    await settle();

    expect(outcome.isResolved).toBe(false);
    expect(errorOf(outcome)).toBeInstanceOf(Error);
    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBe(seeded.deletedUserStatsText);
    expect(await readStoredLog()).toEqual(seeded.log);
  });
});
