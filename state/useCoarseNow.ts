// A coarse clock for time-dependent views (due reviews, the weekly window):
// the current time in milliseconds, refreshed every 30 seconds and when the
// app returns to the foreground.
import { useEffect, useState } from 'react';

import { AppState } from 'react-native';

const TICK_MS = 30_000;

export function useCoarseNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  return now;
}
