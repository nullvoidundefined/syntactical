// Integration tests create and drop databases, so they accept only a Postgres
// on this machine. The URL is parsed with pg-connection-string, the parser pg
// itself uses, and the check runs on the host pg would connect to. Query
// parameters that redirect the connection (host, hostaddr, service) are
// refused outright, as are an empty host and a unix-socket path.
import { parse } from 'pg-connection-string';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REDIRECTING_PARAMETER = /[?&](host|hostaddr|service)=/i;

export function assertLocalDatabaseUrl(databaseUrl: string): void {
    const { host, hostaddr, service } = parse(databaseUrl);
    const isRedirected =
        REDIRECTING_PARAMETER.test(databaseUrl) || hostaddr !== undefined || service !== undefined;
    if (isRedirected || !host || !LOCAL_HOSTS.has(host)) {
        throw new Error(
            'TEST_DATABASE_URL must point at a local Postgres; the integration tests create and drop databases',
        );
    }
}
