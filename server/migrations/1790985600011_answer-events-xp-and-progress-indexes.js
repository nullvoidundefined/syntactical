/**
 * Stores each answer event's awarded XP (computeXp with its due-review decision) so a daily
 * total can be summed without replaying history, and indexes the two reads the incremental
 * daily-progress update makes: one user's events for given questions, and one user's events in
 * an answered_at window. Existing rows default to 0 until a full recompute (PATCH /v1/me)
 * rewrites them.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.addColumn('answer_events', {
        xp: { check: 'xp >= 0', default: 0, notNull: true, type: 'integer' },
    });
    pgm.createIndex('answer_events', ['user_id', 'question_id'], {
        name: 'answer_events_user_question_idx',
    });
    pgm.createIndex('answer_events', ['user_id', 'answered_at'], {
        name: 'answer_events_user_answered_idx',
    });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropIndex('answer_events', ['user_id', 'answered_at'], {
        name: 'answer_events_user_answered_idx',
    });
    pgm.dropIndex('answer_events', ['user_id', 'question_id'], {
        name: 'answer_events_user_question_idx',
    });
    pgm.dropColumn('answer_events', 'xp');
};
