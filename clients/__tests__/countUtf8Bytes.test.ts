import { countUtf8Bytes } from '../countUtf8Bytes';

describe('countUtf8Bytes', () => {
  it.each([
    ['hello', 5],
    ['é', 2],
    ['€', 3],
    ['😀', 4],
    ['', 0],
  ])('counts %j as %i bytes', (text, bytes) => {
    expect(countUtf8Bytes(text)).toBe(bytes);
  });
});
