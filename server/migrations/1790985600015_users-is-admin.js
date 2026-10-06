/**
 * Admin flag on users (IAN-601): false for everyone. It is set only by a direct database update,
 * never by an API.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.addColumn('users', {
        is_admin: { type: 'boolean', notNull: true, default: false },
    });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropColumn('users', 'is_admin');
};
