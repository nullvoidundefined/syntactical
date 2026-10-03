// Fixed benchmark settings for a performance A/B card. Every option is timed in its own
// sandboxed run of `iterations` measured executions (after `warmup` discarded ones), and the
// whole measurement is repeated `runs` times. `noiseFloorMs` is the shortest median the ratio
// trusts: a median below it is raised to it, so two sub-timer-resolution medians cannot
// produce a large ratio. `timeoutMs` is the sandbox wall-clock cap for one run.
export const AB_BENCH = {
    iterations: 30,
    noiseFloorMs: 0.01,
    runs: 2,
    timeoutMs: 6000,
    warmup: 3,
} as const;
