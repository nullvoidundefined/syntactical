/**
 * The daily goal a user chose, effective from a local date onward.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'daily_goal_changes',
        {
            from_date: { notNull: true, type: 'date' },
            goal: { check: 'goal IN (10, 20, 50)', notNull: true, type: 'integer' },
            user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
        },
        { constraints: { primaryKey: ['user_id', 'from_date'] } },
    );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('daily_goal_changes');
};
