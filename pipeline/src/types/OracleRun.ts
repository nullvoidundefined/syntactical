export type OracleOutcome =
    | 'value'
    | 'exception'
    | 'syntax-error'
    | 'timeout'
    | 'resource-limit';

export interface OracleRun {
    outcome: OracleOutcome;
    value?: string;
    exceptionType?: string;
    runtimeVersion?: string;
}
