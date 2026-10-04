// Whether a payload holds a container nested deeper than the scrub's depth cap (B-59.8). Match-only reads
// cannot see past the cap, so a caller that must fail closed asks this instead.
import { MAX_DEPTH } from './purchasePayloadMaxDepth.js';

function exceedsDepthCap(payload: unknown): boolean {
  const pending: { depth: number; node: unknown }[] = [{ depth: 1, node: payload }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { depth, node } = next;
    if (node === null || typeof node !== 'object') {
      continue;
    }
    if (depth > MAX_DEPTH) {
      return true;
    }
    for (const child of Object.values(node)) {
      pending.push({ depth: depth + 1, node: child });
    }
  }
  return false;
}

export { exceedsDepthCap };
