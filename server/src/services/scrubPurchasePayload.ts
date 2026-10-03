// Scrubs a stored purchase payload for a deleted user: every string or object key that carries the
// user's email or id (compared trimmed, NFKC-normalized, and lowercased) becomes `[deleted]`, and
// the RevenueCat PII attributes are cleared whether or not they match. Returns a copy. A renamed
// key never overwrites another key (it takes the first free `[deleted]-n`), a blank identity
// throws, containers nested deeper than 64 levels become `[deleted]`, and an own `__proto__` key
// is kept as a plain own property.
import { normalizeEmail } from './normalizeEmail.js';

const DELETED = '[deleted]';
const MAX_DEPTH = 64;
const PII_ATTRIBUTE_KEYS = new Set(['$displayName', '$email', '$phoneNumber']);

interface PurchaseIdentity {
  email: string;
  userId: string;
}

function carriesIdentity(text: string, needles: string[]): boolean {
  const normalized = normalizeEmail(text);
  return needles.some((needle) => normalized.includes(needle));
}

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function firstFreeDeletedName(taken: Set<string>): string {
  let name = DELETED;
  for (let suffix = 1; taken.has(name); suffix += 1) {
    name = `${DELETED}-${suffix}`;
  }
  return name;
}

// A PII attribute is cleared whatever its type; an object keeps its shape but its `value` is cleared.
function clearAttribute(value: unknown, needles: string[], depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return walkObject(value as Record<string, unknown>, needles, depth, true);
  }
  return DELETED;
}

function walkObject(
  node: Record<string, unknown>,
  needles: string[],
  depth: number,
  isAttribute: boolean,
): Record<string, unknown> {
  const entries = Object.entries(node);
  const taken = new Set<string>();
  for (const [key] of entries) {
    if (!carriesIdentity(key, needles)) {
      taken.add(key);
    }
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    let outKey = key;
    if (carriesIdentity(key, needles)) {
      outKey = firstFreeDeletedName(taken);
      taken.add(outKey);
    }
    let outValue: unknown;
    if (PII_ATTRIBUTE_KEYS.has(key)) {
      outValue = clearAttribute(value, needles, depth + 1);
    } else if (isAttribute && key === 'value' && value !== null && value !== undefined) {
      outValue = DELETED;
    } else {
      outValue = walk(value, needles, depth + 1);
    }
    setOwn(copy, outKey, outValue);
  }
  return copy;
}

function walk(node: unknown, needles: string[], depth: number): unknown {
  if (typeof node === 'string') {
    return carriesIdentity(node, needles) ? DELETED : node;
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (depth > MAX_DEPTH) {
    return DELETED;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, needles, depth + 1));
  }
  return walkObject(node as Record<string, unknown>, needles, depth, false);
}

function scrubPurchasePayload(payload: unknown, identity: PurchaseIdentity): unknown {
  const { email, userId } = identity;
  const needles = [email, userId].map((raw) => normalizeEmail(raw));
  if (needles.some((needle) => needle === '')) {
    throw new Error('scrubPurchasePayload requires a non-blank email and userId');
  }
  return walk(payload, needles, 1);
}

export { scrubPurchasePayload };
