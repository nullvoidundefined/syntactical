/**
 * Emailed sign-in codes. Only the SHA-256 hash of a code is stored (32 bytes,
 * enforced), never the code itself.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable('one_time_codes', {
        attempts: { check: 'attempts >= 0', default: 0, notNull: true, type: 'integer' },
        code_hash: { check: 'octet_length(code_hash) = 32', notNull: true, type: 'bytea' },
        created_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
        email: { notNull: true, type: 'citext' },
        expires_at: { notNull: true, type: 'timestamptz' },
        id: { default: pgm.func('gen_random_uuid()'), primaryKey: true, type: 'uuid' },
        invalidated_at: { type: 'timestamptz' },
        used_at: { type: 'timestamptz' },
    });
    pgm.createIndex('one_time_codes', 'email');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('one_time_codes');
};
