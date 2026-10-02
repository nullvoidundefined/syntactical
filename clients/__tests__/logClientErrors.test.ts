import { logWarning } from '../logClient';

describe('logWarning error serialization', () => {
  it('keeps the name and message of an Error in the payload', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logWarning({ document: 'manifest.json', err: new TypeError('Network request failed') }, 'content fetch failed');
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(payload.err).toEqual({ message: 'Network request failed', name: 'TypeError' });
    expect(payload.document).toBe('manifest.json');
  });
});
