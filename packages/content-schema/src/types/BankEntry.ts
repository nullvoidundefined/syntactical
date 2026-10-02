// A manifest entry for one question bank: path, content hash, access, and counts.
export type BankEntry = {
  path: string;
  hash: string;
  access: 'free' | 'paid';
  productId?: string;
  contentVersion: number;
  topicCounts: Record<string, number>;
};
