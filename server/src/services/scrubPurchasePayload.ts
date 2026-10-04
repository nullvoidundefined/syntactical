// Scrubs a stored purchase payload for a deleted user: every string or object key that carries the
// user's email or id (compared trimmed, NFKC-normalized, and lowercased) becomes `[deleted]`, and
// the RevenueCat PII attributes are cleared whether or not they match (unless `clearPiiAttributes`
// is false, the match-only mode used for rows linked to another user). The default mode matches loosely
// (B-59.7: the email or id anywhere in a string, no boundary rule); match-only stays strict unless
// `isLoose` is set. Returns a copy. A renamed
// key never overwrites another key (it takes the first free `[deleted]-n`), a blank identity
// throws, containers nested deeper than 64 levels (on every path, PII attributes included) become `[deleted]` in the
// default mode but are returned unchanged in match-only mode (B-59.8; exceedsDepthCap.ts tells a caller a payload
// has such a container), and an own `__proto__` key is kept as a plain own property. In strict mode the id matches anywhere inside a string; the email
// matches only as a whole address (no local-part character before it, no domain continuation after it),
// so `jo<email>`, `<email>m`, and `<email>.uk` are kept (see carriesIdentity.ts).
import { carriesIdentity } from "./carriesIdentity.js";
import type { PurchaseIdentity } from "./purchaseIdentity.js";
import { buildNeedles } from "./purchaseNeedles.js";
import { MAX_DEPTH } from "./purchasePayloadMaxDepth.js";

const DELETED = "[deleted]";
interface ScrubOptions {
  clearPiiAttributes: boolean;
  isLoose?: boolean;
}

const PII_ATTRIBUTE_KEYS = new Set(["$displayName", "$email", "$phoneNumber"]);

function isLooseMode({ clearPiiAttributes, isLoose }: ScrubOptions): boolean {
  return isLoose ?? clearPiiAttributes;
}

function setOwn(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
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
function clearAttribute(
  value: unknown,
  needles: PurchaseIdentity,
  depth: number,
  options: ScrubOptions,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    if (depth > MAX_DEPTH) {
      return DELETED;
    }
    return walkObject(
      value as Record<string, unknown>,
      needles,
      depth,
      true,
      options,
    );
  }
  return DELETED;
}

function walkObject(
  node: Record<string, unknown>,
  needles: PurchaseIdentity,
  depth: number,
  isAttribute: boolean,
  options: ScrubOptions,
): Record<string, unknown> {
  const entries = Object.entries(node);
  const carriesOptions = { isLoose: isLooseMode(options) };
  const taken = new Set<string>();
  for (const [key] of entries) {
    if (!carriesIdentity(key, needles, carriesOptions)) {
      taken.add(key);
    }
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    let outKey = key;
    if (carriesIdentity(key, needles, carriesOptions)) {
      outKey = firstFreeDeletedName(taken);
      taken.add(outKey);
    }
    let outValue: unknown;
    if (options.clearPiiAttributes && PII_ATTRIBUTE_KEYS.has(key)) {
      outValue = clearAttribute(value, needles, depth + 1, options);
    } else if (
      isAttribute &&
      key === "value" &&
      value !== null &&
      value !== undefined
    ) {
      outValue = DELETED;
    } else {
      outValue = walk(value, needles, depth + 1, options);
    }
    setOwn(copy, outKey, outValue);
  }
  return copy;
}

function walk(
  node: unknown,
  needles: PurchaseIdentity,
  depth: number,
  options: ScrubOptions,
): unknown {
  if (typeof node === "string") {
    return carriesIdentity(node, needles, { isLoose: isLooseMode(options) })
      ? DELETED
      : node;
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  if (depth > MAX_DEPTH) {
    return options.clearPiiAttributes ? DELETED : node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, needles, depth + 1, options));
  }
  return walkObject(
    node as Record<string, unknown>,
    needles,
    depth,
    false,
    options,
  );
}

function scrubPurchasePayload(
  payload: unknown,
  identity: PurchaseIdentity,
  options: ScrubOptions = { clearPiiAttributes: true },
): unknown {
  return walk(payload, buildNeedles(identity), 1, options);
}

export { scrubPurchasePayload };
