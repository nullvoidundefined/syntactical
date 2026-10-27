// The admin's one Pro access entry from GET and PUT admin/access, or null when the shape is wrong.
// grantSource 'purchase' means an active store purchase of either Pro product (annual or lifetime),
// which the admin cannot switch.
export type AccessEntry = { grantSource: 'admin' | 'purchase' | null; isGranted: boolean; productId: string };

export function parseAccessEntry(value: unknown): AccessEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { grantSource, isGranted, productId } = value as Record<string, unknown>;
  if (typeof productId !== 'string' || typeof isGranted !== 'boolean') return null;
  if (grantSource !== 'admin' && grantSource !== 'purchase' && grantSource !== null) return null;
  return { grantSource, isGranted, productId };
}
