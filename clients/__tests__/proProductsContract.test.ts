// clients/__tests__/proProductsContract.test.ts
// The app's Pro product ids and normalizeProductId against the server's copies
// (server/src/constants/proProducts.ts): the same two ids, and the same answer for every id in one
// table, so a change to either copy that the other does not follow fails here.
import { PRO_PRODUCT_IDS } from '../../constants/proProducts';
import {
  normalizeProductId as normalizeServerProductId,
  PRO_PRODUCT_IDS as SERVER_PRO_PRODUCT_IDS,
} from '../../server/src/constants/proProducts';
import { normalizeProductId } from '../normalizeProductId';

const PRODUCT_IDS = [
  'syntactical.pro.annual',
  'syntactical.pro.annual:yearly',
  'syntactical.pro.lifetime',
  'syntactical.pro.annual:Yearly',
  'syntactical.pro.annual:yearly-2',
  'a:',
  ':b',
  'a:b:c',
  '',
];

describe('Pro products in the app and on the server', () => {
  it('names the same two product ids', () => {
    expect(PRO_PRODUCT_IDS).toEqual(SERVER_PRO_PRODUCT_IDS);
  });

  it.each(PRODUCT_IDS)('normalizes %j the same way', (productId) => {
    expect(normalizeProductId(productId)).toBe(normalizeServerProductId(productId));
  });
});
