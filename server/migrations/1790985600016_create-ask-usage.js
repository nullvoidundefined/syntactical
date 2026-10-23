/**
 * Answers given by POST /v1/ask, per user and UTC date, for the daily limit. A user's earlier
 * dates are pruned on their next ask; rows cascade with the user.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'ask_usage',
        {
            count: { check: 'count >= 0', default: 0, notNull: true, type: 'integer' },
            usage_date: { notNull: true, type: 'date' },
            user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
        },
        { constraints: { primaryKey: ['user_id', 'usage_date'] } },
    );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('ask_usage');
};
