// Owns lifetime stats and the answer event log for the whole app: reads
// both once at startup, migrates v1 stats to v2 in memory (written with the
// first change), backs up any malformed stored value before replacing it,
// keeps a key whose read failed untouched (its changes stay in memory),
// refuses changes until that read completes, and keeps changes in memory
// only when a backup or the migration failed, so a stored value is never
// destroyed unseen. Each recorded answer folds into the stats and appends
// one answer event with a fresh UUID. Every change persists through one
// ordered write queue per key; in-memory state stays authoritative when a
// write fails.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

import type { AnswerEvent } from '@syntactical/progress';

import { readStoredJson } from '../clients/readStoredJson';
import { removeStoredKey } from '../clients/removeStoredKey';
import { generateUuid } from '../clients/uuidClient';
import { writeJson } from '../clients/writeJson';
import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../constants/appConfig';
import { readLocalToday } from '../services/progress/readLocalToday';
import { setGoalFromDate } from '../services/progress/setGoalFromDate';
import { appendAnswerEvent } from '../services/stats/appendAnswerEvent';
import { buildLoggedAnswerEvent } from '../services/stats/buildLoggedAnswerEvent';
import { claimGuestEvents as claimGuest } from '../services/stats/claimGuestEvents';
import { createEmptyStats } from '../services/stats/createEmptyStats';
import { markEvents } from '../services/stats/markEvents';
import { mergeGuestStats } from '../services/stats/mergeGuestStats';
import { recordAnswer as foldAnswer } from '../services/stats/recordAnswer';
import { recordCompletion as foldCompletion } from '../services/stats/recordCompletion';
import { removeUserEvents as removeOwned } from '../services/stats/removeUserEvents';
import { resolveStoredEventLog } from '../services/stats/resolveStoredEventLog';
import { resolveStoredStats } from '../services/stats/resolveStoredStats';
import type { LoggedAnswerEvent } from '../services/stats/types/LoggedAnswerEvent';
import type { RecordedAnswer } from '../services/stats/types/RecordedAnswer';
import type { RoundKey } from '../services/stats/types/RoundKey';
import type { Stats } from '../services/stats/types/Stats';
import { mergeDownloadedEvents as mergeDownloaded } from '../services/sync/mergeDownloadedEvents';

type StatsContextValue = {
  claimGuestEvents: (userId: string) => Promise<void>;
  clearSyncCursor: () => void;
  dismissSignUpPrompt: () => void;
  eventLog: LoggedAnswerEvent[];
  isHydrated: boolean;
  markEventsHeld: (eventIds: string[]) => Promise<void>;
  markEventsSynced: (eventIds: string[]) => Promise<void>;
  mergeDownloadedEvents: (events: AnswerEvent[], cursor: string | null, ownerUserId: string) => Promise<void>;
  recordAnswer: (answer: RecordedAnswer) => void;
  readSyncCursor: (userId: string) => string | null;
  recordCompletion: (event: RoundKey) => void;
  removeUserEvents: (userId: string) => Promise<void>;
  setDailyGoal: (goal: number) => void;
  stats: Stats;
};

type PersistedSlot<T> = {
  isBlocked: MutableRefObject<boolean>;
  key: string;
  queue: MutableRefObject<Promise<unknown>>;
  ref: MutableRefObject<T>;
  setValue: (value: T) => void;
};

const StatsContext = createContext<StatsContextValue | null>(null);

function usePersistedSlot<T>(key: string, initial: () => T): [T, PersistedSlot<T>] {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(value);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const isBlocked = useRef(false);
  // Every member is a stable ref or setter, so the slot is created once.
  const slot = useMemo(() => ({ isBlocked, key, queue, ref, setValue }), [key]);
  return [value, slot];
}

function loadSlot<T>(slot: PersistedSlot<T>, value: T, isBlocked: boolean): void {
  slot.ref.current = value;
  slot.isBlocked.current = isBlocked;
  slot.setValue(value);
}

// Applies the change in memory at once and queues its write; the result says
// whether the value reached storage (false when blocked or the write failed).
function changeSlot<T>(slot: PersistedSlot<T>, fold: (current: T) => T): Promise<boolean> {
  const next = fold(slot.ref.current);
  slot.ref.current = next;
  slot.setValue(next);
  if (slot.isBlocked.current) return Promise.resolve(false);
  const write = slot.queue.current.then(() => writeJson(slot.key, next));
  slot.queue.current = write;
  return write;
}

// Removes a stored key once every write already queued on the slot has run.
function queueKeyRemoval<T>(slot: PersistedSlot<T>, key: string): void {
  slot.queue.current = slot.queue.current.then(() => removeStoredKey(key));
}

// The stats slot's value follows the owner, so each write checks the owner first.
function requireOwner(currentOwner: string | null, userId: string): void {
  if (currentOwner !== userId) throw new Error('guest claim refused: owner changed');
}

async function requirePersisted(isPersisted: Promise<boolean>): Promise<void> {
  if (!(await isPersisted)) throw new Error('event log change was not persisted');
}

type StatsProviderProps = {
  children: ReactNode;
  // An account the server deleted; once it is no longer the owner its local data goes.
  deletedUserId?: string | null;
  ownerUserId?: string | null;
};

export function StatsProvider({ children, deletedUserId = null, ownerUserId = null }: StatsProviderProps) {
  const statsKey = ownerUserId === null ? STORAGE_KEY : buildUserStatsKey(ownerUserId);
  const [loadedStats, statsSlot] = usePersistedSlot<Stats>(statsKey, () => createEmptyStats(readLocalToday()));
  const [eventLog, eventLogSlot] = usePersistedSlot<LoggedAnswerEvent[]>(EVENT_LOG_STORAGE_KEY, () => []);
  const [isEventLogLoaded, setIsEventLogLoaded] = useState(false);
  const [loadedStatsKey, setLoadedStatsKey] = useState<string | null>(null);
  // Stats of the previous owner stay hidden and unwritable until the new owner's load finishes.
  const isStatsLoaded = loadedStatsKey === statsKey;
  const isHydrated = isEventLogLoaded && isStatsLoaded;
  const stats = useMemo(() => (isStatsLoaded ? loadedStats : createEmptyStats(readLocalToday())), [isStatsLoaded, loadedStats]);
  const ownerRef = useRef(ownerUserId);
  useEffect(() => {
    ownerRef.current = ownerUserId;
  }, [ownerUserId]);

  useEffect(() => {
    let isCancelled = false;
    async function hydrate() {
      const statsRead = await readStoredJson(statsSlot.key);
      const { isPersistenceBlocked, stats: storedStats } = await resolveStoredStats(statsRead, readLocalToday());
      if (isCancelled) return;
      loadSlot(statsSlot, storedStats, isPersistenceBlocked);
      setLoadedStatsKey(statsSlot.key);
    }
    void hydrate();
    return () => {
      isCancelled = true;
    };
  }, [statsSlot]);

  useEffect(() => {
    let isCancelled = false;
    async function hydrate() {
      const eventLogRead = await readStoredJson(EVENT_LOG_STORAGE_KEY);
      const { eventLog: storedEventLog, isPersistenceBlocked: isEventLogBlocked } = await resolveStoredEventLog(eventLogRead);
      if (isCancelled) return;
      loadSlot(eventLogSlot, storedEventLog, isEventLogBlocked);
      setIsEventLogLoaded(true);
    }
    void hydrate();
    return () => {
      isCancelled = true;
    };
  }, [eventLogSlot]);

  // A deleted account's events leave the log, and its stats key (sync cursor
  // included) is removed behind any stats write already queued for it.
  useEffect(() => {
    if (deletedUserId === null || deletedUserId === ownerUserId || !isEventLogLoaded) return;
    void changeSlot(eventLogSlot, (current) => current.filter((entry) => entry.ownerUserId !== deletedUserId));
    queueKeyRemoval(statsSlot, buildUserStatsKey(deletedUserId));
  }, [deletedUserId, eventLogSlot, isEventLogLoaded, ownerUserId, statsSlot]);

  const recordAnswer = useCallback(
    (answer: RecordedAnswer) => {
      if (!isHydrated) return;
      // The event, id included, is built before either slot changes, so a
      // failure there (no secure random source) leaves both untouched.
      const stamp = { answeredAt: new Date().toISOString(), eventId: generateUuid(), ownerUserId: ownerRef.current };
      const event = buildLoggedAnswerEvent(answer, stamp);
      changeSlot(statsSlot, (current) => foldAnswer(current, answer));
      changeSlot(eventLogSlot, (current) => appendAnswerEvent(current, event));
    },
    [eventLogSlot, isHydrated, statsSlot],
  );

  // On a user's first sign-in on this device the guest's events and stats
  // become the user's, then the guest stats reset, in that order. A failure
  // between the steps can at worst count the guest's answers twice (owner
  // decision 2026-10-04). An unreadable guest value is never overwritten.
  const claimGuestEvents = useCallback(
    async (userId: string) => {
      if (!isHydrated) return;
      requireOwner(ownerRef.current, userId);
      await requirePersisted(changeSlot(eventLogSlot, (current) => claimGuest(current, userId)));
      const { isPersistenceBlocked, stats: guestStats } = await resolveStoredStats(await readStoredJson(STORAGE_KEY), readLocalToday());
      if (isPersistenceBlocked) throw new Error('guest stats could not be read');
      requireOwner(ownerRef.current, userId);
      await requirePersisted(changeSlot(statsSlot, (current) => mergeGuestStats(guestStats, current)));
      requireOwner(ownerRef.current, userId);
      await requirePersisted(writeJson(STORAGE_KEY, createEmptyStats(readLocalToday())));
    },
    [eventLogSlot, isHydrated, statsSlot],
  );

  const removeUserEvents = useCallback(
    async (userId: string) => {
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => removeOwned(current, userId)));
    },
    [eventLogSlot, isHydrated],
  );

  const clearSyncCursor = useCallback(() => {
    if (!isHydrated) return;
    void changeSlot(statsSlot, ({ syncCursor: _cursor, syncCursorOwner: _owner, ...rest }) => rest);
  }, [isHydrated, statsSlot]);

  // The sync queue's isCurrent guard stops a pass whose user signed out
  // before any of these writes.
  const markEventsAs = useCallback(
    (flag: 'isHeld' | 'isSynced') => async (eventIds: string[]) => {
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => markEvents(current, eventIds, flag)));
    },
    [eventLogSlot, isHydrated],
  );
  const markEventsSynced = useMemo(() => markEventsAs('isSynced'), [markEventsAs]);
  const markEventsHeld = useMemo(() => markEventsAs('isHeld'), [markEventsAs]);

  const mergeDownloadedEvents = useCallback(
    async (events: AnswerEvent[], cursor: string | null, userId: string) => {
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => mergeDownloaded(current, events, userId)));
      // The stats slot's value follows the owner, so a cursor written after
      // the owner changed would land in the next owner's stats.
      if (cursor === null || ownerRef.current !== userId) return;
      await requirePersisted(changeSlot(statsSlot, (current) => ({ ...current, syncCursor: cursor, syncCursorOwner: userId })));
    },
    [eventLogSlot, isHydrated, statsSlot],
  );

  const readSyncCursor = useCallback(
    (userId: string) => {
      const { syncCursor, syncCursorOwner } = stats;
      return syncCursor !== undefined && syncCursorOwner === userId ? syncCursor : null;
    },
    [stats],
  );

  const visibleEventLog = useMemo(() => eventLog.filter((entry) => entry.ownerUserId === ownerUserId), [eventLog, ownerUserId]);

  const recordCompletion = useCallback(
    (event: RoundKey) => {
      if (!isHydrated) return;
      changeSlot(statsSlot, (current) => foldCompletion(current, event));
    },
    [isHydrated, statsSlot],
  );

  // A new goal applies from today on; earlier days keep the goal they had.
  const setDailyGoal = useCallback(
    (goal: number) => {
      if (!isHydrated) return;
      void changeSlot(statsSlot, (current) => ({ ...current, goalHistory: setGoalFromDate(current.goalHistory, readLocalToday(), goal) }));
    },
    [isHydrated, statsSlot],
  );

  const dismissSignUpPrompt = useCallback(() => {
    if (!isHydrated) return;
    void changeSlot(statsSlot, (current) => ({ ...current, isSignUpPromptDismissed: true }));
  }, [isHydrated, statsSlot]);

  const value = useMemo<StatsContextValue>(
    () => ({
      claimGuestEvents,
      clearSyncCursor,
      dismissSignUpPrompt,
      eventLog: visibleEventLog,
      isHydrated,
      markEventsHeld,
      markEventsSynced,
      mergeDownloadedEvents,
      readSyncCursor,
      recordAnswer,
      recordCompletion,
      removeUserEvents,
      setDailyGoal,
      stats,
    }),
    [
      claimGuestEvents,
      clearSyncCursor,
      dismissSignUpPrompt,
      isHydrated,
      markEventsHeld,
      markEventsSynced,
      mergeDownloadedEvents,
      readSyncCursor,
      recordAnswer,
      recordCompletion,
      removeUserEvents,
      setDailyGoal,
      stats,
      visibleEventLog,
    ],
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useQuizStats(): StatsContextValue {
  const value = useContext(StatsContext);
  if (!value) throw new Error('useQuizStats must be used inside StatsProvider');
  return value;
}
