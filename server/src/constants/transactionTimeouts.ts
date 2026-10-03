// Per-transaction Postgres timeouts for the sync and profile transactions, applied with SET LOCAL,
// the SQLSTATEs they raise, and the Retry-After a busy refusal carries.
const TRANSACTION_TIMEOUTS = {
  // Seconds a client should wait before retrying a request refused because the database was busy.
  BUSY_RETRY_AFTER_SECONDS: 1,
  // Bounds a transaction left open by a stalled handler.
  IDLE_IN_TRANSACTION_SESSION: '10s',
  // Postgres SQLSTATE idle_in_transaction_session_timeout, raised when the backend ends an idle transaction.
  IDLE_IN_TRANSACTION_TIMEOUT_CODE: '25P03',
  // Bounds waiting on a row or table lock, which a healthy request never holds that long.
  LOCK: '2s',
  // Postgres SQLSTATE lock_not_available, raised when lock_timeout expires or a NOWAIT lock is held.
  LOCK_TIMEOUT_CODE: '55P03',
  // Bounds the longest legitimate statement: loading up to the 100,000-event cap.
  STATEMENT: '5s',
  // Postgres SQLSTATE query_canceled, raised when statement_timeout expires.
  STATEMENT_TIMEOUT_CODE: '57014',
} as const;

export { TRANSACTION_TIMEOUTS };
