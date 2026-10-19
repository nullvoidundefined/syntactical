import { readErrorCode } from '../readErrorCode';

describe('readErrorCode', () => {
  it('reads a nested string error code', () => {
    expect(readErrorCode({ error: { code: 'SERVER_BUSY' } })).toBe('SERVER_BUSY');
  });

  it.each([[null], [undefined], ['error'], [[]], [{}], [{ error: null }], [{ error: 'x' }], [{ error: { code: 42 } }]])(
    'returns null for %j',
    (body) => {
      expect(readErrorCode(body)).toBeNull();
    },
  );
});
