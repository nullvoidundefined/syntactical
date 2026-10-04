// Why an A/B card was not validated. `unstable` and `no-clear-winner` are the refusals to
// name a winner from runs or judgments that disagree or whose gap is too small to trust.
export type AbFailureReason =
    | 'answer-mismatch'
    | 'missing-code'
    | 'model-output-invalid'
    | 'neither-correct'
    | 'no-clear-winner'
    | 'no-distinguishing-case'
    | 'no-edge-cases'
    | 'runner-error'
    | 'unstable'
    | 'unsupported-language';
