/**
 * XP earned and whether the daily goal was met, per user and local date;
 * derived from answer events.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'daily_progress',
        {
            is_goal_met: { default: false, notNull: true, type: 'boolean' },
            local_date: { notNull: true, type: 'date' },
            user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
            xp: { check: 'xp >= 0', default: 0, notNull: true, type: 'integer' },
        },
        { constraints: { primaryKey: ['user_id', 'local_date'] } },
    );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('daily_progress');
};
