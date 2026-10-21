setExpoExtra({ apiBaseUrl: 'https://api.example.test/v1/', emptyKey: '', numberKey: 7 });

import { readExtraString } from '../readExtraString';
import { setExpoExtra } from '../expoConstantsMock';

describe('readExtraString', () => {
  it('returns a non-empty string value', () => {
    expect(readExtraString('apiBaseUrl')).toBe('https://api.example.test/v1/');
  });

  it.each(['emptyKey', 'numberKey', 'missingKey'])('returns null for %s', (key) => {
    expect(readExtraString(key)).toBeNull();
  });
});
