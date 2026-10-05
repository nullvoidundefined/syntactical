// Inserts a user (unless one is given) and a session row for one integration test, with the
// timestamps and auth method ('code' unless given) the test needs, and returns the plaintext
// token built at run time. Only the token's SHA-256 is stored, as the server stores it.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';

const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 2_592_000_000;

interface SessionTimes {
    authMethod?: 'code' | 'password';
    createdAt: Date;
    expiresAt?: Date;
    lastUsedAt?: Date;
    revokedAt?: Date | null;
    userId?: string;
}

export async function insertSession(
    pool: pg.Pool,
    times: SessionTimes,
): Promise<{ sessionId: string; sessionToken: string; userId: string }> {
    const { authMethod = 'code', createdAt, expiresAt, lastUsedAt, revokedAt = null } = times;
    let { userId } = times;
    if (!userId) {
        const { rows } = await pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
            `learner-${randomUUID()}@example.com`,
        ]);
        [{ id: userId }] = rows;
    }
    const sessionToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO sessions (user_id, token_hash, created_at, last_used_at, expires_at, revoked_at, auth_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
            userId,
            createHash('sha256').update(sessionToken).digest(),
            createdAt,
            lastUsedAt ?? createdAt,
            expiresAt ?? new Date(createdAt.getTime() + SESSION_TTL_MS),
            revokedAt,
            authMethod,
        ],
    );
    const [{ id: sessionId }] = rows;
    return { sessionId, sessionToken, userId };
}
