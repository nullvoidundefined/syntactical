// Bridges React state with persisted stats: reads once on mount, writes
// through on every change, and exposes recordAnswer/recordCompletion.

import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from '../clients/localStorageClient.js';
import { STORAGE_KEY } from '../constants/appConfig.js';
import {
  createEmptyStats,
  recordAnswer as recordAnswerInStats,
  recordCompletion as recordCompletionInStats,
} from '../services/statsService.js';

export function useQuizStats() {
  const [stats, setStats] = useState(() => readJson(STORAGE_KEY, createEmptyStats()));

  useEffect(() => {
    writeJson(STORAGE_KEY, stats);
  }, [stats]);

  const recordAnswer = useCallback((event) => {
    setStats((current) => recordAnswerInStats(current, event));
  }, []);

  const recordCompletion = useCallback((event) => {
    setStats((current) => recordCompletionInStats(current, event));
  }, []);

  return { stats, recordAnswer, recordCompletion };
}
