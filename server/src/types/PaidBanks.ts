// The paid banks held in memory, keyed `language/difficulty`.
import type { PaidBank } from './PaidBank.js';

type PaidBanks = ReadonlyMap<string, PaidBank>;

export type { PaidBanks };
