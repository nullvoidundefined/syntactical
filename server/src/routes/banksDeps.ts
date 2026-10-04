// What the /v1 paid bank route needs from the caller of createApp. The clock defaults to the
// system clock in createApp.
import type { Database } from '../clients/database.js';
import type { PaidBanks } from '../types/PaidBanks.js';

interface BanksDeps {
  database: Database;
  now?: () => Date;
  paidBanks: PaidBanks;
}

type ResolvedBanksDeps = Required<BanksDeps>;

export type { BanksDeps, ResolvedBanksDeps };
