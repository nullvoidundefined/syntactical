// B-3.2r1: the integration tests create and drop databases, so their database
// URL must resolve, the way pg itself resolves it, to this machine.
import { describe, expect, it } from 'vitest';

import { assertLocalDatabaseUrl } from '../../testing/assertLocalDatabaseUrl.js';

describe('assertLocalDatabaseUrl', () => {
    it('refuses a remote host', () => {
        expect(() => assertLocalDatabaseUrl('postgres://postgres@db.remote.example:5432/app')).toThrow(/local/);
    });

    it('refuses a URL whose user name looks local but whose host is remote', () => {
        expect(() => assertLocalDatabaseUrl('postgres://localhost@evil.example/x')).toThrow(/local/);
    });

    it('refuses a host query parameter that overrides a local host', () => {
        expect(() => assertLocalDatabaseUrl('postgres://u@localhost/db?host=remote.example')).toThrow(/local/);
    });

    it('refuses a hostaddr query parameter', () => {
        expect(() => assertLocalDatabaseUrl('postgres://u@localhost/db?hostaddr=203.0.113.9')).toThrow(/local/);
    });

    it('refuses a service query parameter', () => {
        expect(() => assertLocalDatabaseUrl('postgres://u@localhost/db?service=production')).toThrow(/local/);
    });

    it('refuses an empty host', () => {
        expect(() => assertLocalDatabaseUrl('postgres:///db')).toThrow(/local/);
    });

    it('refuses a unix-socket host', () => {
        expect(() => assertLocalDatabaseUrl('postgres://u@%2Fvar%2Frun%2Fpostgresql/db')).toThrow(/local/);
    });

    it('accepts localhost', () => {
        expect(() => assertLocalDatabaseUrl('postgres://postgres@localhost:5432/postgres')).not.toThrow();
    });

    it('accepts 127.0.0.1', () => {
        expect(() => assertLocalDatabaseUrl('postgres://postgres@127.0.0.1:5432/postgres')).not.toThrow();
    });

    it('accepts [::1]', () => {
        expect(() => assertLocalDatabaseUrl('postgres://postgres@[::1]:5432/postgres')).not.toThrow();
    });
});
