/**
 * Enables citext (case-insensitive emails), creates the set_updated_at()
 * trigger function later tables use, and the users table.
 * Requires PostgreSQL 13+ (gen_random_uuid()).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createExtension('citext', { ifNotExists: true });
    pgm.sql(`
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);
    pgm.createTable('users', {
        created_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
        email: { notNull: true, type: 'citext', unique: true },
        id: { default: pgm.func('gen_random_uuid()'), primaryKey: true, type: 'uuid' },
        timezone: { type: 'text' },
    });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('users');
    pgm.sql('DROP FUNCTION IF EXISTS set_updated_at();');
    pgm.dropExtension('citext', { ifExists: true });
};
