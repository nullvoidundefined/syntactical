// Per-transaction Postgres timeouts for the sync and profile transactions, applied with SET LOCAL.
const TRANSACTION_TIMEOUTS = {
  // Bounds a transaction left open by a stalled handler.
  IDLE_IN_TRANSACTION_SESSION: '10s',
  // Bounds waiting on a row or table lock, which a healthy request never holds that long.
  LOCK: '2s',
  // Postgres SQLSTATE lock_not_available, raised when lock_timeout expires.
  LOCK_TIMEOUT_CODE: '55P03',
  // Bounds the longest legitimate statement: loading up to the 100,000-event cap.
  STATEMENT: '5s',
  // Postgres SQLSTATE query_canceled, raised when statement_timeout expires.
  STATEMENT_TIMEOUT_CODE: '57014',
} as const;

export { TRANSACTION_TIMEOUTS };
