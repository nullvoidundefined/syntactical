/**
 * Records the timezone daily_progress was last fully built in (null: never fully built), so an
 * upload can tell that the user's zone changed outside PATCH /v1/me (sign-in sets a null zone)
 * and rebuild instead of updating rows built in another zone.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.addColumn('users', {
        progress_timezone: { type: 'text' },
    });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropColumn('users', 'progress_timezone');
};
