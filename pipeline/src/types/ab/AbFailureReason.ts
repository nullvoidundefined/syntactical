// Why an A/B card was not validated. `unstable` and `no-clear-winner` are the benchmark's
// refusals to name a winner from noisy or small gaps; `judged-only` is never a failure of a
// card but the reason a readability card cannot carry an executed result.
export type AbFailureReason =
    | 'answer-mismatch'
    | 'missing-code'
    | 'neither-correct'
    | 'no-clear-winner'
    | 'no-distinguishing-case'
    | 'no-edge-cases'
    | 'refused'
    | 'runner-error'
    | 'unstable'
    | 'unsupported-language';
