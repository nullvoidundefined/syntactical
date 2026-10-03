// Scrubs a stored purchase payload for a deleted user: every string or object key that carries the
// user's email or id (compared trimmed, NFKC-normalized, and lowercased) becomes `[deleted]`, and
// the RevenueCat PII attributes are cleared whether or not they match. Returns a copy.
import { normalizeEmail } from './normalizeEmail.js';

const DELETED = '[deleted]';
const PII_ATTRIBUTE_KEYS = new Set(['$displayName', '$email', '$phoneNumber']);

interface PurchaseIdentity {
  email: string;
  userId: string;
}

function carriesIdentity(text: string, needles: string[]): boolean {
  const normalized = normalizeEmail(text);
  return needles.some((needle) => normalized.includes(needle));
}

// A PII attribute is a bare string or a `{ value, updated_at_ms }` object; its string value is cleared.
function clearAttribute(value: unknown, needles: string[]): unknown {
  if (typeof value === 'string') {
    return DELETED;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const cleared: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cleared[key] = key === 'value' && typeof entry === 'string' ? DELETED : walk(entry, needles);
    }
    return cleared;
  }
  return walk(value, needles);
}

function walk(node: unknown, needles: string[]): unknown {
  if (typeof node === 'string') {
    return carriesIdentity(node, needles) ? DELETED : node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, needles));
  }
  if (node !== null && typeof node === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      const outKey = carriesIdentity(key, needles) ? DELETED : key;
      copy[outKey] = PII_ATTRIBUTE_KEYS.has(key)
        ? clearAttribute(value, needles)
        : walk(value, needles);
    }
    return copy;
  }
  return node;
}

function scrubPurchasePayload(payload: unknown, identity: PurchaseIdentity): unknown {
  const { email, userId } = identity;
  const needles = [email, userId]
    .map((raw) => normalizeEmail(raw))
    .filter((needle) => needle !== '');
  return walk(payload, needles);
}

export { scrubPurchasePayload };
