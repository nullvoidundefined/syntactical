// Says whether the results card is due and counts the finished round toward the sponsored card cadence,
// once per results screen. The answer is fixed on the first render from the cadence read when the round
// started, counted forward by this round, so the card's slot is there from the first frame or never
// (decision 15). A review round counts but never shows a card; an empty round is not counted. Nothing is
// set once the screen has unmounted.
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  countRound,
  recordCardShown,
  recordRoundCompleted,
  shouldShowResultsCard,
  type SponsorCadence,
} from '../services/sponsor/sponsorCadence';

import type { RoundKind } from './useQuizEngine';

type ResultsSponsorSlotArgs = {
  cadenceAtStart: SponsorCadence | null | undefined;
  roundKind: RoundKind;
  totalQuestions: number;
};

function isDue({ cadenceAtStart, roundKind, totalQuestions }: ResultsSponsorSlotArgs): boolean {
  if (roundKind !== 'bank' || totalQuestions === 0) return false;
  if (cadenceAtStart === null || cadenceAtStart === undefined) return false;
  return shouldShowResultsCard(countRound(cadenceAtStart));
}

export function useResultsSponsorSlot(args: ResultsSponsorSlotArgs) {
  const [isCardDue] = useState(() => isDue(args));
  const hasRecorded = useRef(false);
  const hasMarkedShown = useRef(false);
  const { totalQuestions } = args;

  // The card's own effect (a child's) runs before this screen's, so markCardShown records the round
  // first; both go through the cadence queue, so the reset always follows the count.
  const recordRoundOnce = useCallback(() => {
    if (hasRecorded.current || totalQuestions === 0) return;
    hasRecorded.current = true;
    void recordRoundCompleted();
  }, [totalQuestions]);

  useEffect(() => {
    recordRoundOnce();
  }, [recordRoundOnce]);

  const markCardShown = useCallback(() => {
    if (hasMarkedShown.current) return;
    hasMarkedShown.current = true;
    recordRoundOnce();
    void recordCardShown();
  }, [recordRoundOnce]);

  return { isCardDue, markCardShown };
}
