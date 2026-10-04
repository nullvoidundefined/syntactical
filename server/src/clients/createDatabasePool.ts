// Builds the pg Pool for DATABASE_URL. In production the connection is verified TLS
// (rejectUnauthorized is never false), except on Railway's private network, where the hop stays
// inside the project and TLS is off. A URL that asks for a weaker mode in production is refused,
// so the database host's certificate is always checked on a public connection.
import pg from 'pg';
import type { Logger } from 'pino';

import type { Env } from '../config/env.js';

type ConnectCallback = ((error: Error) => void) | ((error: null, client: pg.Client) => void);

const IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;
const PRIVATE_HOST_SUFFIX = '.railway.internal';
const WEAK_SSL_MODES = new Set(['allow', 'disable', 'no-verify', 'prefer']);

// pg merges every TLS-related URL parameter (ssl, sslrootcert, sslcert, sslkey, sslnegotiation,
// uselibpqcompat) over the explicit ssl option, so none may survive in the connection string.
function stripTlsParams(url: URL): void {
  for (const name of [...url.searchParams.keys()]) {
    if (name.startsWith('ssl') || name === 'uselibpqcompat') url.searchParams.delete(name);
  }
}

function buildPoolConfig(databaseUrl: string, nodeEnv: Env['NODE_ENV']): pg.PoolConfig {
  if (nodeEnv !== 'production') {
    return { connectionString: databaseUrl };
  }
  const url = new URL(databaseUrl);
  if (url.hostname.endsWith(PRIVATE_HOST_SUFFIX)) {
    stripTlsParams(url);
    return { connectionString: url.href, ssl: false };
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode !== null && WEAK_SSL_MODES.has(sslMode)) {
    throw new Error('DATABASE_URL asks for an unverified TLS mode in production');
  }
  stripTlsParams(url);
  return { connectionString: url.href, ssl: { rejectUnauthorized: true } };
}

// A pool or setup failure is logged by error name and pg code only: a driver message can carry
// the connection string.
function describeError(error: unknown): { errorName: string; pgCode?: string } {
  const { code } = (error ?? {}) as { code?: unknown };
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    ...(typeof code === 'string' ? { pgCode: code } : {}),
  };
}

// Opens every connection with the idle-in-transaction timeout already set, so the setting is in
// force before the pool hands the client out. The pool calls connect(callback). A session left
// idle inside a transaction would hold its locks, so the server ends it. A failed SET is logged
// and the connection is still used: the pooled URL of some providers refuses session settings.
function createGuardedClientClass(logger: Logger): typeof pg.Client {
  return class GuardedClient extends pg.Client {
    override connect(): Promise<pg.Client>;
    override connect(callback: ConnectCallback): void;
    override connect(callback?: ConnectCallback): Promise<pg.Client> | void {
      const setTimeout = async (): Promise<void> => {
        try {
          await this.query(`SET idle_in_transaction_session_timeout = ${IDLE_IN_TRANSACTION_TIMEOUT_MS}`);
        } catch (error) {
          logger.error(describeError(error), 'could not set idle_in_transaction_session_timeout');
        }
      };
      if (callback === undefined) {
        return super.connect().then(async (client) => {
          await setTimeout();
          return client;
        });
      }
      // pg-pool's own callback form: (error) on failure, (null, client) on success.
      const done = callback as (error: Error | null, client?: pg.Client) => void;
      super.connect((error: Error | null) => {
        if (error) {
          done(error);
          return;
        }
        void setTimeout().then(() => done(null, this));
      });
    }
  };
}

function createDatabasePool(databaseUrl: string, nodeEnv: Env['NODE_ENV'], logger: Logger): pg.Pool {
  const pool = new pg.Pool({ ...buildPoolConfig(databaseUrl, nodeEnv), Client: createGuardedClientClass(logger) });
  // An idle client that loses its backend emits here; without a listener it would crash the process.
  pool.on('error', (error) => {
    logger.error(describeError(error), 'database pool error');
  });
  return pool;
}

export { buildPoolConfig, createDatabasePool, IDLE_IN_TRANSACTION_TIMEOUT_MS };
