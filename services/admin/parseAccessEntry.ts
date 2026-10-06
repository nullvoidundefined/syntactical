// One product's access entry from GET and PUT admin/access, or null when the shape is wrong.
export type AccessEntry = { grantSource: 'admin' | 'purchase' | null; isGranted: boolean; productId: string };

export function parseAccessEntry(value: unknown): AccessEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { grantSource, isGranted, productId } = value as Record<string, unknown>;
  if (typeof productId !== 'string' || typeof isGranted !== 'boolean') return null;
  if (grantSource !== 'admin' && grantSource !== 'purchase' && grantSource !== null) return null;
  return { grantSource, isGranted, productId };
}

export function parseAccessList(body: unknown): AccessEntry[] | null {
  const products = (body as { data?: { products?: unknown } } | null)?.data?.products;
  if (!Array.isArray(products)) return null;
  const entries = products.map(parseAccessEntry);
  return entries.every((entry) => entry !== null) ? (entries as AccessEntry[]) : null;
}
