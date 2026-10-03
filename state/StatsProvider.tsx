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
import { generateUuid } from '../clients/uuidClient';
import { writeJson } from '../clients/writeJson';
import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../constants/appConfig';
import { readLocalToday } from '../services/progress/readLocalToday';
import { appendAnswerEvent } from '../services/stats/appendAnswerEvent';
import { buildLoggedAnswerEvent } from '../services/stats/buildLoggedAnswerEvent';
import { claimGuestEvents as claimGuest } from '../services/stats/claimGuestEvents';
import { createEmptyStats } from '../services/stats/createEmptyStats';
import { discardUnsyncedEvents as discardUnsynced } from '../services/stats/discardUnsyncedEvents';
import { markEvents } from '../services/stats/markEvents';
import { mergeGuestStats } from '../services/stats/mergeGuestStats';
import { recordAnswer as foldAnswer } from '../services/stats/recordAnswer';
import { recordCompletion as foldCompletion } from '../services/stats/recordCompletion';
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
  discardUnsyncedEvents: (userId: string) => Promise<void>;
  eventLog: LoggedAnswerEvent[];
  isHydrated: boolean;
  markEventsHeld: (eventIds: string[], ownerUserId: string) => Promise<void>;
  markEventsSynced: (eventIds: string[], ownerUserId: string) => Promise<void>;
  mergeDownloadedEvents: (events: AnswerEvent[], cursor: string | null, ownerUserId: string) => Promise<void>;
  recordAnswer: (answer: RecordedAnswer) => void;
  readSyncCursor: (userId: string) => string | null;
  recordCompletion: (event: RoundKey) => void;
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

async function mergeIntoStoredUser(userId: string, guestStats: Stats): Promise<Stats> {
  const read = await readStoredJson(buildUserStatsKey(userId));
  const { stats: userStats } = await resolveStoredStats(read, readLocalToday());
  return mergeGuestStats(guestStats, userStats);
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

async function requirePersisted(isPersisted: Promise<boolean>): Promise<void> {
  if (!(await isPersisted)) throw new Error('event log change was not persisted');
}

export function StatsProvider({ children, ownerUserId = null }: { children: ReactNode; ownerUserId?: string | null }) {
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

  // The guest's stats go to the user first and the guest's reset follows,
  // so a failed first write leaves the guest's stats where they were.
  const claimGuestStats = useCallback(
    async (userId: string) => {
      const isGuestLoaded = ownerRef.current === null;
      const guestStats = isGuestLoaded
        ? statsSlot.ref.current
        : (await resolveStoredStats(await readStoredJson(STORAGE_KEY), readLocalToday())).stats;
      const isUserLoaded = ownerRef.current === userId;
      const isPersisted = isUserLoaded
        ? await changeSlot(statsSlot, (current) => mergeGuestStats(guestStats, current))
        : await writeJson(buildUserStatsKey(userId), await mergeIntoStoredUser(userId, guestStats));
      if (!isPersisted) throw new Error('guest stats claim was not persisted');
      const empty = createEmptyStats(readLocalToday());
      if (isGuestLoaded) await changeSlot(statsSlot, () => empty);
      else await writeJson(STORAGE_KEY, empty);
    },
    [statsSlot],
  );

  const claimGuestEvents = useCallback(
    async (userId: string) => {
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => claimGuest(current, userId)));
      await claimGuestStats(userId);
    },
    [claimGuestStats, eventLogSlot, isHydrated],
  );

  const discardUnsyncedEvents = useCallback(
    async (userId: string) => {
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => discardUnsynced(current, userId)));
    },
    [eventLogSlot, isHydrated],
  );

  const clearSyncCursor = useCallback(() => {
    if (!isHydrated) return;
    void changeSlot(statsSlot, ({ syncCursor: _cursor, syncCursorOwner: _owner, ...rest }) => rest);
  }, [isHydrated, statsSlot]);

  // A sync pass that outlives a sign-out names its owner; a mismatch writes nothing.
  const assertOwner = useCallback((expectedOwner: string | null | undefined) => {
    if (typeof expectedOwner !== 'string' || expectedOwner !== ownerRef.current) throw new Error('sync change refused: owner changed');
  }, []);

  const markEventsAs = useCallback(
    (flag: 'isHeld' | 'isSynced') => async (eventIds: string[], expectedOwner: string) => {
      assertOwner(expectedOwner);
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => markEvents(current, eventIds, flag)));
    },
    [assertOwner, eventLogSlot, isHydrated],
  );
  const markEventsSynced = useMemo(() => markEventsAs('isSynced'), [markEventsAs]);
  const markEventsHeld = useMemo(() => markEventsAs('isHeld'), [markEventsAs]);

  const mergeDownloadedEvents = useCallback(
    async (events: AnswerEvent[], cursor: string | null, expectedOwner: string) => {
      assertOwner(expectedOwner);
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => mergeDownloaded(current, events, expectedOwner)));
      if (cursor === null) return;
      // The owner may have changed while the event-log write was pending.
      assertOwner(expectedOwner);
      await requirePersisted(
        changeSlot(statsSlot, (current) => ({ ...current, syncCursor: cursor, syncCursorOwner: expectedOwner })),
      );
    },
    [assertOwner, eventLogSlot, isHydrated, statsSlot],
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

  const value = useMemo<StatsContextValue>(
    () => ({
      claimGuestEvents,
      clearSyncCursor,
      discardUnsyncedEvents,
      eventLog: visibleEventLog,
      isHydrated,
      markEventsHeld,
      markEventsSynced,
      mergeDownloadedEvents,
      readSyncCursor,
      recordAnswer,
      recordCompletion,
      stats,
    }),
    [
      claimGuestEvents,
      clearSyncCursor,
      discardUnsyncedEvents,
      isHydrated,
      markEventsHeld,
      markEventsSynced,
      mergeDownloadedEvents,
      readSyncCursor,
      recordAnswer,
      recordCompletion,
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
