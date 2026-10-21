// The app with its /v1/banks route wired to a real database for one integration test: a fixed
// clock the test reads (so it can insert live or expired sessions), the paid banks the test
// builds in memory, a silent logger, and the one allowed origin.
import type pg from 'pg';

import { createTestApp } from './createTestApp.js';
import type { PaidBanks } from '../../types/PaidBanks.js';

interface BanksTestAppOptions {
  paidBanks: PaidBanks;
  pool: pg.Pool;
}

export function createBanksTestApp(options: BanksTestAppOptions) {
  const { paidBanks, pool } = options;
  const { app, clock } = createTestApp({ banks: { paidBanks }, pool });
  return { app, now: clock.now };
}
