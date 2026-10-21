// One action at a time: run(work) invokes work unless another run is still in flight, in which
// case it resolves to undefined without invoking it. isBusy is true from the start of a run until
// its work settles, so a submit button can disable itself and a second press is ignored.
import { useCallback, useRef, useState } from 'react';

export type ExclusiveAction = {
  isBusy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
};

export function useExclusiveAction(): ExclusiveAction {
  const [isBusy, setIsBusy] = useState(false);
  const isInFlightRef = useRef(false);

  const run = useCallback(async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    if (isInFlightRef.current) return undefined;
    isInFlightRef.current = true;
    setIsBusy(true);
    try {
      return await work();
    } finally {
      isInFlightRef.current = false;
      setIsBusy(false);
    }
  }, []);

  return { isBusy, run };
}
