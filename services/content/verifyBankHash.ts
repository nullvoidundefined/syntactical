// Verifies downloaded bank text against the SHA-256 hash the manifest
// declares. Fails closed: a malformed expected hash never matches.
import { SHA256_HEX } from '@syntactical/content-schema';
import { hashTextSha256 } from '../../clients/hashClient';


export async function verifyBankHash(
  text: string,
  expectedHash: string,
  hashText: (text: string) => Promise<string> = hashTextSha256,
): Promise<boolean> {
  if (!SHA256_HEX.test(expectedHash)) return false;
  const actualHash = await hashText(text);
  return actualHash.toLowerCase() === expectedHash;
}
