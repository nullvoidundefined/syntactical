// B-69 (Task 7.3): the password policy normalizes with NFKC and counts code points after
// normalization: 12 to 128 pass, any characters, no composition rule, never trimmed. A lone
// UTF-16 surrogate, or a raw string over 512 UTF-16 units, is malformed input.
// Every password is built at run time from random bytes; none is written as a literal.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AUTH } from '../../constants/auth.js';
import { ERROR_CODES } from '../../errors.js';
import { checkPasswordPolicy } from '../../services/checkPasswordPolicy.js';

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const FIRST_EMOJI_CODE_POINT = 0x1f600;
const EMOJI_RANGE = 0x40;
const FIRST_CJK_CODE_POINT = 0x4e00;
const CJK_RANGE = 0x1000;
// U+FB01 LATIN SMALL LIGATURE FI: one code point that NFKC turns into two ("fi").
const FI_LIGATURE = String.fromCodePoint(0xfb01);
const LONE_HIGH_SURROGATE = String.fromCharCode(0xd800);
const LONE_LOW_SURROGATE = String.fromCharCode(0xdc00);
const RAW_MAX_UTF16_UNITS = 512;

// A run-time string of `length` code points drawn from `alphabet`.
function buildFrom(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  let result = '';
  for (const byte of bytes) result += alphabet[byte % alphabet.length];
  return result;
}

function buildAscii(length: number): string {
  return buildFrom(LOWERCASE + DIGITS + LOWERCASE.toUpperCase(), length);
}

// `count` four-byte emoji, each two UTF-16 units and one code point.
function buildEmoji(count: number): string {
  const bytes = randomBytes(count);
  return Array.from(bytes, (byte) => String.fromCodePoint(FIRST_EMOJI_CODE_POINT + (byte % EMOJI_RANGE))).join('');
}

function buildCjk(count: number): string {
  const bytes = randomBytes(count * 2);
  let result = '';
  for (let index = 0; index < count; index += 1) {
    result += String.fromCodePoint(FIRST_CJK_CODE_POINT + (bytes.readUInt16BE(index * 2) % CJK_RANGE));
  }
  return result;
}

function countCodePoints(value: string): number {
  return Array.from(value).length;
}

describe('password policy constants', () => {
  it('declares the error codes and the length limits from the spec', () => {
    expect(ERROR_CODES.AUTH.PASSWORD_TOO_SHORT).toBe('AUTH_PASSWORD_TOO_SHORT');
    expect(ERROR_CODES.AUTH.PASSWORD_TOO_LONG).toBe('AUTH_PASSWORD_TOO_LONG');
    expect(ERROR_CODES.AUTH.PASSWORD_BREACHED).toBe('AUTH_PASSWORD_BREACHED');
    expect(AUTH.PASSWORD.MIN_LENGTH).toBe(12);
    expect(AUTH.PASSWORD.MAX_LENGTH).toBe(128);
    expect(AUTH.PASSWORD.RAW_MAX_LENGTH).toBe(RAW_MAX_UTF16_UNITS);
  });
});

describe('checkPasswordPolicy length', () => {
  it('rejects 11 code points as too short', () => {
    expect(checkPasswordPolicy(buildAscii(11))).toEqual({ code: 'AUTH_PASSWORD_TOO_SHORT', isOk: false });
  });

  it('accepts 12 code points and returns the normalized form', () => {
    const raw = buildAscii(12);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('accepts 128 code points', () => {
    const raw = buildAscii(128);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('rejects 129 code points as too long', () => {
    expect(checkPasswordPolicy(buildAscii(129))).toEqual({ code: 'AUTH_PASSWORD_TOO_LONG', isOk: false });
  });

  it('rejects the empty string as too short', () => {
    expect(checkPasswordPolicy('')).toEqual({ code: 'AUTH_PASSWORD_TOO_SHORT', isOk: false });
  });
});

describe('checkPasswordPolicy counts code points, not UTF-16 units or bytes', () => {
  it('accepts 12 four-byte emoji', () => {
    const raw = buildEmoji(12);
    expect(raw.length).toBe(24);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('rejects 11 four-byte emoji as too short, though they are 22 UTF-16 units', () => {
    const raw = buildEmoji(11);
    expect(raw.length).toBe(22);
    expect(checkPasswordPolicy(raw)).toEqual({ code: 'AUTH_PASSWORD_TOO_SHORT', isOk: false });
  });

  it('accepts 128 four-byte emoji, though they are 256 UTF-16 units', () => {
    const raw = buildEmoji(128);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('rejects 129 four-byte emoji as too long', () => {
    expect(checkPasswordPolicy(buildEmoji(129))).toEqual({ code: 'AUTH_PASSWORD_TOO_LONG', isOk: false });
  });

  it('accepts 12 characters of a non-Latin script', () => {
    const raw = buildCjk(12);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw.normalize('NFKC') });
  });
});

describe('checkPasswordPolicy normalizes with NFKC before counting', () => {
  it('accepts 11 code points that become 12 after NFKC and returns the NFKC form', () => {
    const raw = buildAscii(10) + FI_LIGATURE;
    expect(countCodePoints(raw)).toBe(11);
    const normalized = raw.normalize('NFKC');
    expect(countCodePoints(normalized)).toBe(12);

    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized });
  });

  it('rejects 128 code points that become 129 after NFKC as too long', () => {
    const raw = buildAscii(127) + FI_LIGATURE;
    expect(countCodePoints(raw)).toBe(128);

    expect(checkPasswordPolicy(raw)).toEqual({ code: 'AUTH_PASSWORD_TOO_LONG', isOk: false });
  });
});

describe('checkPasswordPolicy accepts any characters with no composition rule', () => {
  it('keeps leading and trailing spaces in the normalized password', () => {
    const raw = `  ${buildAscii(10)}  `;
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('accepts inner spaces', () => {
    const raw = `${buildAscii(6)} ${buildAscii(6)}`;
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('accepts 12 spaces', () => {
    const raw = ' '.repeat(12);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('rejects 11 spaces as too short, so spaces are never trimmed into or out of the count', () => {
    expect(checkPasswordPolicy(' '.repeat(11))).toEqual({ code: 'AUTH_PASSWORD_TOO_SHORT', isOk: false });
  });

  it('accepts an all-lowercase password', () => {
    const raw = buildFrom(LOWERCASE, 12);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });

  it('accepts an all-digit password', () => {
    const raw = buildFrom(DIGITS, 12);
    expect(checkPasswordPolicy(raw)).toEqual({ isOk: true, normalized: raw });
  });
});

describe('checkPasswordPolicy rejects malformed input', () => {
  it('rejects a lone high surrogate as an invalid body', () => {
    const raw = buildAscii(6) + LONE_HIGH_SURROGATE + buildAscii(6);
    expect(checkPasswordPolicy(raw)).toEqual({ code: 'INPUT_INVALID_BODY', isOk: false });
  });

  it('rejects a lone low surrogate as an invalid body', () => {
    const raw = buildAscii(6) + LONE_LOW_SURROGATE + buildAscii(6);
    expect(checkPasswordPolicy(raw)).toEqual({ code: 'INPUT_INVALID_BODY', isOk: false });
  });

  it('rejects a trailing lone high surrogate as an invalid body', () => {
    const raw = buildAscii(12) + LONE_HIGH_SURROGATE;
    expect(checkPasswordPolicy(raw)).toEqual({ code: 'INPUT_INVALID_BODY', isOk: false });
  });

  it('rejects a raw string over 512 UTF-16 units as an invalid body, before the length rule', () => {
    expect(checkPasswordPolicy(buildAscii(RAW_MAX_UTF16_UNITS + 1))).toEqual({
      code: 'INPUT_INVALID_BODY',
      isOk: false,
    });
  });
});
