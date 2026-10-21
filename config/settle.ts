// Lets a suite's pending asynchronous work finish without sleeping real time:
// inside one act, each round yields a macrotask so microtasks and 0 ms timers
// (React Query's notify batch, AsyncStorage's mock, a chained fetch mock) run.
// Under Jest fake timers it advances the clock by 0 ms instead, so it never
// hangs and no virtual time passes. It replaces the per-file
// `await new Promise((resolve) => setTimeout(resolve, 50))` helpers.
import { act } from 'react';

const DEFAULT_ROUNDS = 10;

function isFakeClock(): boolean {
  const timer = setTimeout as unknown as { clock?: unknown; _isMockFunction?: boolean };
  return timer.clock !== undefined || timer._isMockFunction === true;
}

export async function settle(rounds: number = DEFAULT_ROUNDS): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      if (isFakeClock()) await jest.advanceTimersByTimeAsync(0);
      else await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  });
}
