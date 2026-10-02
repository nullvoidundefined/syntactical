// Small type guards and patterns shared by the content cache and validators.
export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
