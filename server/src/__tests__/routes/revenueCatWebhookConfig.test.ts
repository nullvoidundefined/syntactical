// B-39a2 (B-39, security section): the RevenueCat webhook secret is at least 32 characters once
// trimmed, so createApp refuses to build with an empty, short, or whitespace-padded value that an
// absent or empty Authorization header could come close to. The error names the dependency and
// never echoes the value. Every value is built at run time.
import { randomBytes } from 'node:crypto';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';

const SECRET_MIN_LENGTH = 32;
const PADDING_LENGTH = 40;

const silentLogger = pino({ level: 'silent' });

function okDb() {
    return {
        connect: async (): Promise<never> => {
            throw new Error('not used');
        },
        query: async (_sql: string): Promise<unknown> => ({ rows: [] }),
    };
}

// A random value of exactly the given length.
function valueOfLength(length: number): string {
    return randomBytes(length).toString('hex').slice(0, length);
}

function build(revenueCatAuth: string) {
    const db = okDb();
    return createApp({
        db,
        logger: silentLogger,
        webhooks: {
            database: db as never,
            now: () => new Date(),
            paidProductIds: new Set<string>(),
            revenueCatAuth,
        },
    });
}

function captureBuildError(revenueCatAuth: string): unknown {
    try {
        build(revenueCatAuth);
    } catch (error) {
        return error;
    }
    return undefined;
}

describe('createApp webhooks.revenueCatAuth check (B-39a2)', () => {
    const rejected: Array<[string, () => string]> = [
        ['an empty value', () => ''],
        ['a whitespace-only value longer than 32 characters', () => ' '.repeat(PADDING_LENGTH)],
        ['a value one character short of 32', () => valueOfLength(SECRET_MIN_LENGTH - 1)],
        [
            'a short value padded with spaces to look long',
            () => `${' '.repeat(PADDING_LENGTH)}${valueOfLength(SECRET_MIN_LENGTH - 1)}${' '.repeat(PADDING_LENGTH)}`,
        ],
        [
            'a short value padded with tabs and newlines to look long',
            () => `\t\n${valueOfLength(SECRET_MIN_LENGTH - 1)}\n\t${'\t'.repeat(PADDING_LENGTH)}`,
        ],
    ];

    it.each(rejected)('throws at build time for %s, naming the dependency and not the value', (_label, make) => {
        const value = make();

        const error = captureBuildError(value);

        expect(error).toBeInstanceOf(Error);
        const { message } = error as Error;
        expect(message).toContain('revenueCatAuth');
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            expect(message).not.toContain(trimmed);
        }
    });

    it('builds with a value of exactly 32 characters but not with the same value less its last character', () => {
        const value = valueOfLength(SECRET_MIN_LENGTH);

        expect(() => build(value)).not.toThrow();
        expect(() => build(value.slice(0, -1))).toThrow('revenueCatAuth');
    });
});
