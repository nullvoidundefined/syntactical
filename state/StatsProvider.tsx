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
import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, GUEST_CLAIM_STORAGE_KEY, STORAGE_KEY } from '../constants/appConfig';
import { readLocalToday } from '../services/progress/readLocalToday';
import { appendAnswerEvent } from '../services/stats/appendAnswerEvent';
import { buildLoggedAnswerEvent } from '../services/stats/buildLoggedAnswerEvent';
import { claimGuestEvents as claimGuest } from '../services/stats/claimGuestEvents';
import { createEmptyStats } from '../services/stats/createEmptyStats';
import { discardUnsyncedEvents as discardUnsynced } from '../services/stats/discardUnsyncedEvents';
import { markEvents } from '../services/stats/markEvents';
import { mergeGuestStats } from '../services/stats/mergeGuestStats';
import { readGuestClaimMarker } from '../services/stats/readGuestClaimMarker';
import { recordAnswer as foldAnswer } from '../services/stats/recordAnswer';
import { recordCompletion as foldCompletion } from '../services/stats/recordCompletion';
import { releaseEvents } from '../services/stats/releaseEvents';
import { resolveStoredEventLog } from '../services/stats/resolveStoredEventLog';
import { resolveStoredStats } from '../services/stats/resolveStoredStats';
import type { GuestClaimMarker } from '../services/stats/types/GuestClaimMarker';
import type { HeldReason, LoggedAnswerEvent } from '../services/stats/types/LoggedAnswerEvent';
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
  markEventsHeld: (eventIds: string[], ownerUserId: string, reason?: HeldReason) => Promise<void>;
  markEventsReleased: (eventIds: string[], ownerUserId: string) => Promise<void>;
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

// Removes a stored key once every write already queued on the slot has run.
function queueKeyRemoval<T>(slot: PersistedSlot<T>, key: string): void {
  slot.queue.current = slot.queue.current.then(() => removeStoredKey(key));
}

async function requirePersisted(isPersisted: Promise<boolean>): Promise<void> {
  if (!(await isPersisted)) throw new Error('event log change was not persisted');
}

function requireOwner(currentOwner: string | null, userId: string): void {
  if (currentOwner !== userId) throw new Error('guest stats claim refused: owner changed');
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

  const readGuestStats = useCallback(
    async () =>
      statsSlot.key === STORAGE_KEY
        ? statsSlot.ref.current
        : (await resolveStoredStats(await readStoredJson(STORAGE_KEY), readLocalToday())).stats,
    [statsSlot],
  );

  // True for a folded marker whose recorded guest stats are still the stored ones.
  const isFoldPendingReset = useCallback(
    async (marker: GuestClaimMarker | null) => {
      if (marker === null) return false;
      const { folded, snapshot } = marker;
      if (!folded || snapshot === undefined) return false;
      const { attempted, correct } = (await readGuestStats()).totals;
      const { attempted: foldedAttempted, correct: foldedCorrect } = snapshot;
      return attempted === foldedAttempted && correct === foldedCorrect;
    },
    [readGuestStats],
  );

  const finishGuestReset = useCallback(async () => {
    const empty = createEmptyStats(readLocalToday());
    const isReset =
      statsSlot.key === STORAGE_KEY ? await changeSlot(statsSlot, () => empty) : await writeJson(STORAGE_KEY, empty);
    if (isReset) await writeJson(GUEST_CLAIM_STORAGE_KEY, null);
    return isReset;
  }, [statsSlot]);

  useEffect(() => {
    let isCancelled = false;
    async function hydrate() {
      const statsRead = await readStoredJson(statsSlot.key);
      const { isPersistenceBlocked, stats: storedStats } = await resolveStoredStats(statsRead, readLocalToday());
      if (isCancelled) return;
      loadSlot(statsSlot, storedStats, isPersistenceBlocked);
      setLoadedStatsKey(statsSlot.key);
      // A fold that finished but whose guest reset failed: only the reset is left.
      // A marker whose guest stats changed since the fold is stale: it is only cleared.
      const marker = await readGuestClaimMarker();
      if (isCancelled) return;
      if ((await isFoldPendingReset(marker))) await finishGuestReset();
      else if ((await readStoredJson(GUEST_CLAIM_STORAGE_KEY)).value !== null) await writeJson(GUEST_CLAIM_STORAGE_KEY, null);
    }
    void hydrate();
    return () => {
      isCancelled = true;
    };
  }, [finishGuestReset, isFoldPendingReset, statsSlot]);

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

  // A marker is persisted before the fold, so the same guest stats are never
  // folded twice; the guest reset follows the fold, and a failed reset leaves
  // the marker for the next claim or mount to finish without folding again.
  const foldGuestStats = useCallback(
    async (userId: string) => {
      const guestStats = await readGuestStats();
      const userKey = buildUserStatsKey(userId);
      const mergedStored = ownerRef.current === userId ? null : await mergeIntoStoredUser(userId, guestStats);
      // Checked right before each write: a changed owner means no write at all.
      requireOwner(ownerRef.current, userId);
      const isPersisted =
        mergedStored === null
          ? await changeSlot(statsSlot, (current) => mergeGuestStats(guestStats, current))
          : await writeJson(userKey, mergedStored);
      if (!isPersisted) throw new Error('guest stats claim was not persisted');
      return { attempted: guestStats.totals.attempted, correct: guestStats.totals.correct };
    },
    [readGuestStats, statsSlot],
  );

  const claimGuestStats = useCallback(
    async (userId: string) => {
      const marker = await readGuestClaimMarker();
      // A stale folded marker is overwritten by the normal claim below.
      const isFoldPending = await isFoldPendingReset(marker);
      if (!isFoldPending) {
        if (!(await writeJson(GUEST_CLAIM_STORAGE_KEY, { folded: false, userId }))) {
          throw new Error('guest stats claim marker was not persisted');
        }
        const snapshot = await foldGuestStats(userId);
        if (!(await writeJson(GUEST_CLAIM_STORAGE_KEY, { folded: true, snapshot, userId }))) {
          throw new Error('guest stats claim marker was not persisted');
        }
      }
      requireOwner(ownerRef.current, userId);
      if (!(await finishGuestReset())) throw new Error('guest stats reset was not persisted');
    },
    [finishGuestReset, foldGuestStats, isFoldPendingReset],
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
    (flag: 'isHeld' | 'isSynced') => async (eventIds: string[], expectedOwner: string, reason?: HeldReason) => {
      assertOwner(expectedOwner);
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => markEvents(current, eventIds, flag, reason)));
    },
    [assertOwner, eventLogSlot, isHydrated],
  );
  const markEventsSynced = useMemo(() => markEventsAs('isSynced'), [markEventsAs]);
  const markEventsHeld = useMemo(() => markEventsAs('isHeld'), [markEventsAs]);

  const markEventsReleased = useCallback(
    async (eventIds: string[], expectedOwner: string) => {
      assertOwner(expectedOwner);
      if (!isHydrated) return;
      await requirePersisted(changeSlot(eventLogSlot, (current) => releaseEvents(current, eventIds)));
    },
    [assertOwner, eventLogSlot, isHydrated],
  );

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
      markEventsReleased,
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
      markEventsReleased,
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
