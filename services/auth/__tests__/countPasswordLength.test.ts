// countPasswordLength (Task 7.7, B-87 on-device check): the length the server
// counts, in Unicode code points after NFKC normalization, so the app's check
// agrees with the server's policy (12 to 128 code points). Every value here is
// built at run time from code points; none is a password literal.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../constants/appConfig';
import { countPasswordLength } from '../countPasswordLength';

const GRINNING_FACE = 0x1f600; // one code point, two UTF-16 units
const LATIN_SMALL_LIGATURE_FI = 0xfb01; // NFKC expands it to "f" + "i"
const COMBINING_ACUTE_ACCENT = 0x0301; // "e" + this composes to one "é" under NFKC
const FULLWIDTH_LATIN_SMALL_A = 0xff41; // NFKC maps it to one "a"

function repeatCodePoint(codePoint: number, count: number): string {
  return String.fromCodePoint(codePoint).repeat(count);
}

describe('countPasswordLength', () => {
  it('counts plain ASCII characters one each', () => {
    expect(countPasswordLength(repeatCodePoint(0x61, 12))).toBe(12);
  });

  it('counts an emoji outside the Basic Multilingual Plane as one code point, not two UTF-16 units', () => {
    const value = String.fromCodePoint(GRINNING_FACE);
    expect(value.length).toBe(2);
    expect(countPasswordLength(value)).toBe(1);
  });

  it('counts U+FB01 (the "fi" ligature) as two, after NFKC expands it', () => {
    expect(countPasswordLength(String.fromCodePoint(LATIN_SMALL_LIGATURE_FI))).toBe(2);
  });

  it('counts "e" followed by a combining acute accent as one, after NFKC composes it', () => {
    expect(countPasswordLength(String.fromCodePoint(0x65, COMBINING_ACUTE_ACCENT))).toBe(1);
  });

  it('counts a fullwidth letter as one after NFKC maps it to its ASCII form', () => {
    expect(countPasswordLength(repeatCodePoint(FULLWIDTH_LATIN_SMALL_A, 3))).toBe(3);
  });

  it('counts spaces, including leading and trailing ones, and never trims them', () => {
    const spaced = ` ${repeatCodePoint(0x62, 10)} `;
    expect(countPasswordLength(spaced)).toBe(12);
  });

  it('counts 12 emoji as exactly the minimum length, though they are 24 UTF-16 units', () => {
    const value = repeatCodePoint(GRINNING_FACE, PASSWORD_MIN_LENGTH);
    expect(value.length).toBe(PASSWORD_MIN_LENGTH * 2);
    expect(countPasswordLength(value)).toBe(PASSWORD_MIN_LENGTH);
  });

  it('returns 0 for an empty string', () => {
    expect(countPasswordLength('')).toBe(0);
  });
});

describe('password length constants', () => {
  it('match the server policy: 12 to 128 code points', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });
});
