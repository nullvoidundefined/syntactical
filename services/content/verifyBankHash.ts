// Verifies downloaded bank text against the SHA-256 hash the manifest
// declares. Fails closed: a malformed expected hash never matches.
import { hashTextSha256 } from '../../clients/hashClient';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export async function verifyBankHash(
  text: string,
  expectedHash: string,
  hashText: (text: string) => Promise<string> = hashTextSha256,
): Promise<boolean> {
  if (!SHA256_HEX_PATTERN.test(expectedHash)) return false;
  const actualHash = await hashText(text);
  return actualHash.toLowerCase() === expectedHash;
}
