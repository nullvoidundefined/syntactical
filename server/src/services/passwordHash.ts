import { randomBytes as cryptoRandomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { AUTH } from '../constants/auth.js';
import type { PasswordHashParams } from '../types/PasswordHashParams.js';

interface DeriveOptions {
  N: number;
  maxmem: number;
  p: number;
  r: number;
}

type DeriveKey = (input: Buffer, salt: Buffer, keyBytes: number, options: DeriveOptions) => Promise<Buffer>;

interface HashDeps {
  deriveKey?: DeriveKey;
  params?: PasswordHashParams;
  randomBytes?: (size: number) => Buffer;
}

interface VerifyDeps {
  compare?: (left: Buffer, right: Buffer) => boolean;
  deriveKey?: DeriveKey;
}

interface ParsedHash {
  key: Buffer;
  logN: number;
  p: number;
  r: number;
  salt: Buffer;
}

const { HASH } = AUTH.PASSWORD;

const CURRENT_PARAMS: PasswordHashParams = {
  keyBytes: HASH.KEY_BYTES,
  logN: HASH.LOG_N,
  p: HASH.P,
  r: HASH.R,
  saltBytes: HASH.SALT_BYTES,
};

// Upper bounds on what a stored string may ask for, so a corrupt row cannot demand unbounded work.
// The cost cap keeps 128 * N * r within HASH.MAXMEM, so raising the parameters means raising both.
const MAX_LOG_N = 20;
const MAX_R = 32;
const MAX_P = 16;
const MAX_COST = 2 ** 20;
const MIN_BYTES = 16;
const MAX_BYTES = 128;
// Salt and key lengths are whole 16-byte blocks, so a truncated or padded field fails closed.
const BYTES_STEP = 16;

const STORED_PATTERN = /^\$scrypt\$v=1\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const defaultDeriveKey = promisify(scrypt) as DeriveKey;

function encodeBase64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}

// Strict unpadded base64: rejects lengths no byte string makes and non-canonical trailing bits,
// so one byte string has one encoding.
function decodeBase64(text: string): Buffer | undefined {
  if (text.length % 4 === 1) {
    return undefined;
  }
  const bytes = Buffer.from(text, 'base64');
  return encodeBase64(bytes) === text ? bytes : undefined;
}

function isInRange(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

function isValidSize(bytes: number): boolean {
  return bytes >= MIN_BYTES && bytes <= MAX_BYTES && bytes % BYTES_STEP === 0;
}

// The one rule for what a hash may be made with and a stored string may claim.
function areParamsValid({ keyBytes, logN, p, r, saltBytes }: PasswordHashParams): boolean {
  return (
    isInRange(logN, MAX_LOG_N) &&
    isInRange(r, MAX_R) &&
    isInRange(p, MAX_P) &&
    2 ** logN * r * p <= MAX_COST &&
    isValidSize(saltBytes) &&
    isValidSize(keyBytes)
  );
}

function parseStored(stored: string): ParsedHash | undefined {
  const match = STORED_PATTERN.exec(stored);
  if (!match) {
    return undefined;
  }
  const logN = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  const salt = decodeBase64(match[4]!);
  const key = decodeBase64(match[5]!);
  if (!salt || !key) {
    return undefined;
  }
  const valid = areParamsValid({ keyBytes: key.length, logN, p, r, saltBytes: salt.length });
  return valid ? { key, logN, p, r, salt } : undefined;
}

async function deriveWith(
  deriveKey: DeriveKey,
  candidate: string,
  salt: Buffer,
  keyBytes: number,
  { logN, p, r }: { logN: number; p: number; r: number },
): Promise<Buffer> {
  const input = Buffer.from(candidate.normalize('NFKC'), 'utf8');
  return deriveKey(input, salt, keyBytes, { maxmem: HASH.MAXMEM, N: 2 ** logN, p, r });
}

async function hashPassword(normalized: string, deps: HashDeps = {}): Promise<string> {
  const { deriveKey = defaultDeriveKey, params = CURRENT_PARAMS, randomBytes = cryptoRandomBytes } = deps;
  if (!areParamsValid(params)) {
    throw new Error('Password hash parameters are outside the accepted bounds');
  }
  const salt = randomBytes(params.saltBytes);
  const key = await deriveWith(deriveKey, normalized, salt, params.keyBytes, params);
  return `$scrypt$v=1$ln=${params.logN},r=${params.r},p=${params.p}$${encodeBase64(salt)}$${encodeBase64(key)}`;
}

// Never throws: a malformed stored string, a derivation failure, or a length mismatch is false.
async function verifyPassword(normalized: string, stored: string, deps: VerifyDeps = {}): Promise<boolean> {
  const { compare = timingSafeEqual, deriveKey = defaultDeriveKey } = deps;
  const parsed = parseStored(stored);
  if (!parsed) {
    return false;
  }
  try {
    const derived = await deriveWith(deriveKey, normalized, parsed.salt, parsed.key.length, parsed);
    if (derived.length !== parsed.key.length) {
      return false;
    }
    return compare(derived, parsed.key);
  } catch {
    return false;
  }
}

// Whether the stored string is one verifyPassword can derive against; if not, it derives nothing.
function isUsableHash(stored: string): boolean {
  return parseStored(stored) !== undefined;
}

function needsRehash(stored: string, params: PasswordHashParams = CURRENT_PARAMS): boolean {
  const parsed = parseStored(stored);
  if (!parsed) {
    return true;
  }
  return (
    parsed.logN !== params.logN ||
    parsed.r !== params.r ||
    parsed.p !== params.p ||
    parsed.salt.length !== params.saltBytes ||
    parsed.key.length !== params.keyBytes
  );
}

// A current-parameter hash of a random secret nobody learns, for spending the same derivation
// time when no account exists.
async function createDummyPasswordHash(deps: HashDeps = {}): Promise<string> {
  const randomBytes = deps.randomBytes ?? cryptoRandomBytes;
  return hashPassword(randomBytes(CURRENT_PARAMS.keyBytes).toString('base64'), deps);
}

export { createDummyPasswordHash, hashPassword, isUsableHash, needsRehash, verifyPassword };
export type { DeriveKey };
