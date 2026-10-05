/**
 * Password sign-in storage: a nullable scrypt hash on users (null: the user has no password, only
 * the email code), when it was last set, and how each session was authenticated. Existing users get
 * no password and existing sessions are 'code'.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.addColumns('users', {
        password_hash: { type: 'text' },
        password_updated_at: { type: 'timestamptz' },
    });
    // LIKE, not ILIKE: the prefix is case-sensitive.
    pgm.addConstraint('users', 'users_password_hash_scrypt_check', {
        check: "password_hash IS NULL OR password_hash LIKE '$scrypt$%'",
    });
    pgm.addColumn('sessions', {
        auth_method: { type: 'text', notNull: true, default: 'code' },
    });
    pgm.addConstraint('sessions', 'sessions_auth_method_check', {
        check: "auth_method IN ('code', 'password')",
    });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropConstraint('sessions', 'sessions_auth_method_check');
    pgm.dropColumn('sessions', 'auth_method');
    pgm.dropConstraint('users', 'users_password_hash_scrypt_check');
    pgm.dropColumns('users', ['password_hash', 'password_updated_at']);
};
