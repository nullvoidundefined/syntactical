// The 32-byte digest stored in place of a one-time code or session token.
import { createHash } from 'node:crypto';

function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

export { sha256 };
