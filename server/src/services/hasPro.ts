// Whether a user has Pro at `now` (spec "2. Pro", Server): any row readActiveProRows returns.
import type { Database } from '../clients/database.js';

import { readActiveProRows } from './readActiveProRows.js';

async function hasPro(database: Database, userId: string, now: Date): Promise<boolean> {
  return (await readActiveProRows(database, userId, now)).length > 0;
}

export { hasPro };
