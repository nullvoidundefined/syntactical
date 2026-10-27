// A manifest entry for one question bank: path, content hash, content version, and topic counts. Every bank is
// free: `access` and `productId` are retired, accepted and ignored until the free-banks contract step removes
// them, so no new code reads either one.
export type BankEntry = {
  path: string;
  hash: string;
  contentVersion: number;
  topicCounts: Record<string, number>;
  access?: 'free' | 'paid';
  productId?: string;
};
