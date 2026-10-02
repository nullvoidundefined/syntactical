// Thin wrapper around expo-crypto: SHA-256 of a string's UTF-8 bytes as
// lowercase hex, the format the content manifest records for each bank.
import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync } from 'expo-crypto';

export async function hashTextSha256(text: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, text, {
    encoding: CryptoEncoding.HEX,
  });
}
