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

import { readStoredJson } from '../clients/readStoredJson';
import { generateUuid } from '../clients/uuidClient';
import { writeJson } from '../clients/writeJson';
import { EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../constants/appConfig';
import { readLocalToday } from '../services/progress/readLocalToday';
import { appendAnswerEvent } from '../services/stats/appendAnswerEvent';
import { buildLoggedAnswerEvent } from '../services/stats/buildLoggedAnswerEvent';
import { createEmptyStats } from '../services/stats/createEmptyStats';
import { recordAnswer as foldAnswer } from '../services/stats/recordAnswer';
import { recordCompletion as foldCompletion } from '../services/stats/recordCompletion';
import { resolveStoredEventLog } from '../services/stats/resolveStoredEventLog';
import { resolveStoredStats } from '../services/stats/resolveStoredStats';
import type { LoggedAnswerEvent } from '../services/stats/types/LoggedAnswerEvent';
import type { RecordedAnswer } from '../services/stats/types/RecordedAnswer';
import type { RoundKey } from '../services/stats/types/RoundKey';
import type { Stats } from '../services/stats/types/Stats';

type StatsContextValue = {
  eventLog: LoggedAnswerEvent[];
  isHydrated: boolean;
  recordAnswer: (answer: RecordedAnswer) => void;
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

function changeSlot<T>(slot: PersistedSlot<T>, fold: (current: T) => T): void {
  const next = fold(slot.ref.current);
  slot.ref.current = next;
  slot.setValue(next);
  if (slot.isBlocked.current) return;
  slot.queue.current = slot.queue.current.then(() => writeJson(slot.key, next));
}

export function StatsProvider({ children, ownerUserId = null }: { children: ReactNode; ownerUserId?: string | null }) {
  const [stats, statsSlot] = usePersistedSlot<Stats>(STORAGE_KEY, () => createEmptyStats(readLocalToday()));
  const [eventLog, eventLogSlot] = usePersistedSlot<LoggedAnswerEvent[]>(EVENT_LOG_STORAGE_KEY, () => []);
  const [isHydrated, setIsHydrated] = useState(false);
  const ownerRef = useRef(ownerUserId);
  useEffect(() => {
    ownerRef.current = ownerUserId;
  }, [ownerUserId]);

  useEffect(() => {
    let isCancelled = false;
    async function hydrate() {
      const [statsRead, eventLogRead] = await Promise.all([readStoredJson(STORAGE_KEY), readStoredJson(EVENT_LOG_STORAGE_KEY)]);
      const { isPersistenceBlocked: isStatsBlocked, stats: storedStats } = await resolveStoredStats(statsRead, readLocalToday());
      const { eventLog: storedEventLog, isPersistenceBlocked: isEventLogBlocked } = await resolveStoredEventLog(eventLogRead);
      if (isCancelled) return;
      loadSlot(statsSlot, storedStats, isStatsBlocked);
      loadSlot(eventLogSlot, storedEventLog, isEventLogBlocked);
      setIsHydrated(true);
    }
    void hydrate();
    return () => {
      isCancelled = true;
    };
  }, [eventLogSlot, statsSlot]);

  const recordAnswer = useCallback(
    (answer: RecordedAnswer) => {
      if (!isHydrated) return;
      changeSlot(statsSlot, (current) => foldAnswer(current, answer));
      const stamp = { answeredAt: new Date().toISOString(), eventId: generateUuid(), ownerUserId: ownerRef.current };
      const event = buildLoggedAnswerEvent(answer, stamp);
      changeSlot(eventLogSlot, (current) => appendAnswerEvent(current, event));
    },
    [eventLogSlot, isHydrated, statsSlot],
  );

  const recordCompletion = useCallback(
    (event: RoundKey) => {
      if (!isHydrated) return;
      changeSlot(statsSlot, (current) => foldCompletion(current, event));
    },
    [isHydrated, statsSlot],
  );

  const value = useMemo<StatsContextValue>(
    () => ({ eventLog, isHydrated, recordAnswer, recordCompletion, stats }),
    [eventLog, isHydrated, recordAnswer, recordCompletion, stats],
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useQuizStats(): StatsContextValue {
  const value = useContext(StatsContext);
  if (!value) throw new Error('useQuizStats must be used inside StatsProvider');
  return value;
}
