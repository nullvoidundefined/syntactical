// clients/__tests__/normalizeProductId.test.ts
// A store product identifier as the app spells product ids: a Google Play subscription's
// <subscription id>:<base plan id> loses its base plan; a plain id and anything malformed come
// back unchanged.
import { normalizeProductId } from '../normalizeProductId';

describe('normalizeProductId', () => {
  it.each([
    ['a Play annual with its base plan', 'syntactical.pro.annual:yearly', 'syntactical.pro.annual'],
    ['a plain annual id', 'syntactical.pro.annual', 'syntactical.pro.annual'],
    ['a plain lifetime id', 'syntactical.pro.lifetime', 'syntactical.pro.lifetime'],
    ['a colon with nothing after it', 'a:', 'a:'],
    ['two colons', 'a:b:c', 'a:b:c'],
  ])('maps %s', (_label, productId, expected) => {
    expect(normalizeProductId(productId)).toBe(expected);
  });
});
