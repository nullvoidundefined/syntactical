// Owns lifetime stats for the whole app: reads them once at startup,
// refuses changes until that read completes, then persists every change
// through one ordered write queue. In-memory stats stay authoritative
// when a write fails.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readJson, writeJson } from '../clients/storageClient';
import { STORAGE_KEY } from '../constants/appConfig';
import {
  createEmptyStats,
  recordAnswer as foldAnswer,
  recordCompletion as foldCompletion,
  type Stats,
} from '../services/stats/statsService';

type RoundKey = { language: string; difficulty: string };
type StatsContextValue = {
  stats: Stats;
  isHydrated: boolean;
  recordAnswer: (event: RoundKey & { wasCorrect: boolean }) => void;
  recordCompletion: (event: RoundKey) => void;
};

const StatsContext = createContext<StatsContextValue | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats>(createEmptyStats);
  const [isHydrated, setIsHydrated] = useState(false);
  const statsRef = useRef<Stats>(stats);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    readJson(STORAGE_KEY, createEmptyStats()).then((stored) => {
      statsRef.current = stored;
      setStats(stored);
      setIsHydrated(true);
    });
  }, []);

  const applyChange = useCallback(
    (fold: (current: Stats) => Stats) => {
      if (!isHydrated) return;
      const next = fold(statsRef.current);
      statsRef.current = next;
      setStats(next);
      writeQueue.current = writeQueue.current.then(() => writeJson(STORAGE_KEY, next));
    },
    [isHydrated],
  );

  const value = useMemo<StatsContextValue>(
    () => ({
      stats,
      isHydrated,
      recordAnswer: (event) => applyChange((current) => foldAnswer(current, event)),
      recordCompletion: (event) => applyChange((current) => foldCompletion(current, event)),
    }),
    [stats, isHydrated, applyChange],
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useQuizStats(): StatsContextValue {
  const value = useContext(StatsContext);
  if (!value) throw new Error('useQuizStats must be used inside StatsProvider');
  return value;
}
