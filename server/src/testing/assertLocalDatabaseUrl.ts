// Integration tests create and drop databases, so they accept only a Postgres
// on this machine.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assertLocalDatabaseUrl(databaseUrl: string): void {
    const { hostname } = new URL(databaseUrl);
    if (!LOCAL_HOSTS.has(hostname)) {
        throw new Error(
            'TEST_DATABASE_URL must point at a local Postgres; the integration tests create and drop databases',
        );
    }
}
