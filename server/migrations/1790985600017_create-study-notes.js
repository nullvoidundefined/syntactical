/**
 * The weekly study note GET /v1/study-note wrote for a user, one per local week (keyed by the
 * week's Monday). A user's earlier weeks are pruned when a new note is stored; rows cascade with
 * the user.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'study_notes',
        {
            created_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
            note: { notNull: true, type: 'text' },
            user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
            week_start: { notNull: true, type: 'date' },
        },
        { constraints: { primaryKey: ['user_id', 'week_start'] } },
    );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('study_notes');
};
