// The slice of a pg.Pool the server's data access uses: plain queries and pooled clients for
// transactions. A real pg.Pool satisfies it.
import type pg from 'pg';

type Database = Pick<pg.Pool, 'connect' | 'query'>;

export type { Database };
