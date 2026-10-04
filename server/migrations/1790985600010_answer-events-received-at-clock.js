/**
 * answer_events.received_at defaults to clock_timestamp() (the insert time) instead of NOW()
 * (the transaction start).
 *
 * Ordering invariant for GET /v1/answer-events paging, which walks a user's events by
 * (received_at, event_id) with a keyset cursor: for one user, received_at must increase in
 * commit order, or a reader can pass a row's position before that row commits and never see
 * it. Every writer therefore inserts a user's events only while holding that user's row lock
 * (SELECT ... FROM users WHERE id = $1 FOR UPDATE, as ingestAnswerEvents does) and stamps
 * received_at with clock_timestamp() after taking the lock. NOW() is the transaction start,
 * which can precede the lock wait, so it would break the invariant; this default makes a
 * writer that omits received_at take the safe value.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.alterColumn('answer_events', 'received_at', { default: pgm.func('clock_timestamp()') });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.alterColumn('answer_events', 'received_at', { default: pgm.func('NOW()') });
};
