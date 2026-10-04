/**
 * Drops what the incremental daily-progress update needed (migrations 011 and 012): each
 * answer event's stored xp, its (user_id, question_id) index, and users.progress_timezone.
 * Every upload and PATCH /v1/me now rebuilds daily_progress from all of the user's events.
 * The (user_id, answered_at) index stays: the full rebuild reads a user's events in that order.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.dropIndex('answer_events', ['user_id', 'question_id'], {
        name: 'answer_events_user_question_idx',
    });
    pgm.dropColumn('answer_events', 'xp');
    pgm.dropColumn('users', 'progress_timezone');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.addColumn('users', {
        progress_timezone: { type: 'text' },
    });
    pgm.addColumn('answer_events', {
        xp: { check: 'xp >= 0', default: 0, notNull: true, type: 'integer' },
    });
    pgm.createIndex('answer_events', ['user_id', 'question_id'], {
        name: 'answer_events_user_question_idx',
    });
};
