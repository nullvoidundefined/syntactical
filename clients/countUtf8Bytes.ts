// The UTF-8 byte length of a string, for size limits on content bodies.
export function countUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
