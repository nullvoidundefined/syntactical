/**
 * Fixed-window request counters, one row per (key, window_start), updated
 * atomically by an upsert.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'rate_limit_counters',
        {
            count: { check: 'count >= 0', default: 0, notNull: true, type: 'integer' },
            key: { notNull: true, type: 'text' },
            window_start: { notNull: true, type: 'timestamptz' },
        },
        { constraints: { primaryKey: ['key', 'window_start'] } },
    );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('rate_limit_counters');
};
