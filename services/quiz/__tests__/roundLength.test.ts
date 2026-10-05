import { buildPlayHref } from '../buildPlayHref';
import { isLengthChoiceOffered, listRoundLengths, readPoolSize, readRoundCount } from '../roundLength';

describe('listRoundLengths', () => {
  it('offers only the fixed lengths smaller than the pool', () => {
    expect(listRoundLengths(100)).toEqual([20, 50]);
    expect(listRoundLengths(51)).toEqual([20, 50]);
    expect(listRoundLengths(50)).toEqual([20]);
    expect(listRoundLengths(30)).toEqual([20]);
    expect(listRoundLengths(20)).toEqual([]);
    expect(listRoundLengths(15)).toEqual([]);
    expect(isLengthChoiceOffered(30)).toBe(true);
    expect(isLengthChoiceOffered(20)).toBe(false);
  });
});

describe('readRoundCount', () => {
  it('honors only a listed length smaller than the pool', () => {
    expect(readRoundCount('20', 100)).toBe(20);
    expect(readRoundCount('50', 100)).toBe(50);
  });

  it.each([undefined, '', 'abc', '20abc', '0', '-20', '-1', '20.5', '1e1', '30', '100', '200', ['20'], ['20', '50']])(
    'plays the whole pool for %j',
    (raw) => {
      expect(readRoundCount(raw, 100)).toBeUndefined();
    },
  );

  it('plays the whole pool when the length is not smaller than it', () => {
    expect(readRoundCount('50', 50)).toBeUndefined();
    expect(readRoundCount('20', 20)).toBeUndefined();
    expect(readRoundCount('20', 15)).toBeUndefined();
  });
});

describe('readPoolSize', () => {
  it('sums the bank, or reads one topic, treating an unknown topic as empty', () => {
    expect(readPoolSize({ a: 60, b: 40 }, undefined)).toBe(100);
    expect(readPoolSize({ a: 60, b: 40 }, 'a')).toBe(60);
    expect(readPoolSize({ a: 60 }, 'zzz')).toBe(0);
  });
});

describe('buildPlayHref', () => {
  it('carries the topic and count alongside each other, encoded', () => {
    expect(buildPlayHref({ difficulty: 'easy', language: 'python' })).toBe('/python/easy/play');
    expect(buildPlayHref({ count: 20, difficulty: 'easy', language: 'python' })).toBe('/python/easy/play?count=20');
    expect(buildPlayHref({ count: 50, difficulty: 'easy', language: 'python', topic: 'a b' })).toBe(
      '/python/easy/play?topic=a%20b&count=50',
    );
    expect(buildPlayHref({ difficulty: 'easy', language: 'python', screen: 'length', topic: 'x' })).toBe(
      '/python/easy/length?topic=x',
    );
  });
});
