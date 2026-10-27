// The admin's Pro toggle state, in the AdminProductEntry shape the app parses, always for the
// lifetime product, from the active Pro rows hasPro reads (readActiveProRows): 'purchase' when any
// active row's source is not 'admin' (a store purchase of either product, an annual included, or a
// test grant); else 'admin' when the admin's own lifetime grant is in force; else not granted. So
// the entry is granted exactly when hasPro is true. Takes a pooled client too, so setAdminAccess
// can answer from inside its transaction.
import type pg from 'pg';

import type { Database } from '../clients/database.js';
import { PRO_PRODUCT_IDS } from '../constants/proProducts.js';
import type { AdminProductEntry } from '../types/AdminProductEntry.js';

import { readActiveProRows } from './readActiveProRows.js';
import type { ActiveProRow } from './readActiveProRows.js';
import { toAdminProductEntry } from './toAdminProductEntry.js';

const ADMIN_SOURCE = 'admin';

type Queryable = Database | pg.PoolClient;

// The source the entry reports: any source but 'admin' first (toAdminProductEntry reads it as
// 'purchase'), then the admin's own grant, else none.
function grantedSourceOf(rows: readonly ActiveProRow[]): string | undefined {
  const purchase = rows.find(({ source }) => source !== ADMIN_SOURCE);
  if (purchase) {
    return purchase.source;
  }
  return rows.length > 0 ? ADMIN_SOURCE : undefined;
}

async function listAdminAccess(queryable: Queryable, userId: string, now: Date): Promise<AdminProductEntry> {
  return toAdminProductEntry(
    PRO_PRODUCT_IDS.LIFETIME,
    grantedSourceOf(await readActiveProRows(queryable, userId, now)),
  );
}

export { listAdminAccess };
