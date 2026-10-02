// Records one completion in the stats when a round ends. recordCompletion
// changes identity whenever stats change, so a ref keeps the effect from
// re-firing after its own write.
import { useEffect, useRef } from 'react';

import type { RoundKey } from '../services/stats/types/RoundKey';

import { useQuizStats } from './StatsProvider';

export function useRoundCompletion(isComplete: boolean, roundKey: RoundKey): void {
  const { recordCompletion } = useQuizStats();
  const { difficulty, language } = roundKey;
  const hasRecordedCompletion = useRef(false);
  useEffect(() => {
    if (!isComplete || hasRecordedCompletion.current) return;
    hasRecordedCompletion.current = true;
    recordCompletion({ difficulty, language });
  }, [difficulty, isComplete, language, recordCompletion]);
}
