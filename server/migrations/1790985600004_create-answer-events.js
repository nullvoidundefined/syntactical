/**
 * Append-only answer events, keyed by (user_id, event_id) so an event the
 * client uploads more than once is stored once.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'answer_events',
        {
            answered_at: { notNull: true, type: 'timestamptz' },
            bank_key: { notNull: true, type: 'text' },
            choice_index: { check: 'choice_index >= 0', notNull: true, type: 'integer' },
            event_id: { notNull: true, type: 'uuid' },
            is_correct: { notNull: true, type: 'boolean' },
            question_id: { notNull: true, type: 'text' },
            received_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
            round_kind: { check: "round_kind IN ('bank', 'topic', 'review')", notNull: true, type: 'text' },
            user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
        },
        { constraints: { primaryKey: ['user_id', 'event_id'] } },
    );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('answer_events');
};
