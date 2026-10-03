/**
 * A user's right to one paid bank. Rows outlive the user (user_id is set null
 * on delete) so purchases stay on record for accounting.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'entitlements',
        {
            id: { default: pgm.func('gen_random_uuid()'), primaryKey: true, type: 'uuid' },
            product_id: { notNull: true, type: 'text' },
            source: { notNull: true, type: 'text' },
            status: { check: "status IN ('granted', 'revoked')", notNull: true, type: 'text' },
            updated_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
            user_id: { onDelete: 'SET NULL', references: 'users', type: 'uuid' },
        },
        { constraints: { unique: [['user_id', 'product_id']] } },
    );
    pgm.sql(`
        CREATE TRIGGER set_entitlements_updated_at BEFORE UPDATE ON entitlements
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('entitlements');
};
