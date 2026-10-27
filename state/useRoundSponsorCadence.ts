// Reads the sponsored card cadence once, when a round starts, so the round's results screen can decide on
// its first render whether a card is due (decision 15: the slot never pops in late). undefined until the
// read resolves, null when it failed; nothing is set once the round has unmounted.
import { useEffect, useState } from 'react';

import { readSponsorCadence, type SponsorCadence } from '../services/sponsor/sponsorCadence';

export function useRoundSponsorCadence(): SponsorCadence | null | undefined {
  const [cadence, setCadence] = useState<SponsorCadence | null | undefined>(undefined);
  useEffect(() => {
    let isMounted = true;
    void readSponsorCadence().then((read) => {
      if (isMounted) setCadence(read);
    });
    return () => {
      isMounted = false;
    };
  }, []);
  return cadence;
}
