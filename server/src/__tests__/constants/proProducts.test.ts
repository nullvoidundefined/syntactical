// The two Pro products (spec "2. Pro", Products): the ids the webhook, hasPro, the profile, and the
// admin toggle match exactly, and the list every query uses. Both must fit the app's
// PRODUCT_ID_PATTERN (constants/appConfig.ts:45), restated here because the server never imports
// the app. normalizeProductId strips the base-plan suffix RevenueCat adds to a Google Play
// subscription's id (`<subscription id>:<base plan id>`) and leaves any other id as it is.
import { describe, expect, it } from 'vitest';

import { normalizeProductId, PRO_PRODUCT_ID_LIST, PRO_PRODUCT_IDS } from '../../constants/proProducts.js';

const APP_PRODUCT_ID_PATTERN = /^syntactical\.[a-z0-9-]+\.[a-z0-9-]+$/;

describe('PRO_PRODUCT_IDS', () => {
  it('names the annual and the lifetime product', () => {
    expect(PRO_PRODUCT_IDS).toEqual({ ANNUAL: 'syntactical.pro.annual', LIFETIME: 'syntactical.pro.lifetime' });
  });

  it('lists exactly those two ids', () => {
    expect([...PRO_PRODUCT_ID_LIST].sort()).toEqual(['syntactical.pro.annual', 'syntactical.pro.lifetime']);
  });

  it('gives ids that match the app product id pattern', () => {
    for (const id of PRO_PRODUCT_ID_LIST) {
      expect(id).toMatch(APP_PRODUCT_ID_PATTERN);
    }
  });
});

describe('normalizeProductId', () => {
  it('maps a Google Play subscription id with its base plan to the subscription id', () => {
    expect(normalizeProductId('syntactical.pro.annual:yearly')).toBe('syntactical.pro.annual');
  });

  it.each(['syntactical.pro.annual', 'syntactical.pro.lifetime', 'syntactical.cobol.full'])(
    'leaves the plain id %s unchanged',
    (productId) => {
      expect(normalizeProductId(productId)).toBe(productId);
    },
  );

  it.each([
    'syntactical.pro.annual:',
    ':yearly',
    'a:b:c',
    'syntactical.pro.annual:yearly:extra',
    'syntactical.pro.annual:Yearly',
    'syntactical.pro.annual:year ly',
  ])('leaves the malformed id %s unchanged', (productId) => {
    expect(normalizeProductId(productId)).toBe(productId);
  });
});
