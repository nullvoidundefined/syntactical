import AsyncStorage from '@react-native-async-storage/async-storage';
import { readJson, writeJson } from '../storageClient';

describe('storageClient', () => {
  beforeEach(() => AsyncStorage.clear());

  it('returns the fallback when the key is missing', async () => {
    expect(await readJson('missing', { empty: true })).toEqual({ empty: true });
  });

  it('returns the fallback when the stored value is not valid JSON', async () => {
    await AsyncStorage.setItem('broken', '{not json');
    expect(await readJson('broken', 7)).toBe(7);
  });

  it('returns the fallback when storage throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));
    expect(await readJson('any', 'fallback')).toBe('fallback');
  });

  it('round-trips a value', async () => {
    expect(await writeJson('stats', { a: 1 })).toBe(true);
    expect(await readJson('stats', null)).toEqual({ a: 1 });
  });

  it('resolves false without throwing when storage rejects the write', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(writeJson('stats', { a: 1 })).resolves.toBe(false);
  });
});
