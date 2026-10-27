// constants/__tests__/proAskLimitContract.test.ts
// The Pro daily ask limit the Pro sheet names against the server's (ASK.DAILY_LIMIT.PRO in
// server/src/constants/ask.ts), so the sheet's copy cannot drift from what the server allows.
import { ASK } from '../../server/src/constants/ask';
import { PRO_DAILY_ASK_LIMIT } from '../proProducts';

describe('the Pro daily ask limit in the app and on the server', () => {
  it('is the same number', () => {
    expect(PRO_DAILY_ASK_LIMIT).toBe(ASK.DAILY_LIMIT.PRO);
  });
});
