/**
 * Signed-in sessions. Only the SHA-256 hash of the session token is stored
 * (32 bytes, enforced, unique), never the token itself.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable('sessions', {
        created_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
        expires_at: { notNull: true, type: 'timestamptz' },
        id: { default: pgm.func('gen_random_uuid()'), primaryKey: true, type: 'uuid' },
        last_used_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
        revoked_at: { type: 'timestamptz' },
        token_hash: {
            check: 'octet_length(token_hash) = 32',
            notNull: true,
            type: 'bytea',
            unique: true,
        },
        user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
    });
    pgm.createIndex('sessions', 'user_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('sessions');
};
