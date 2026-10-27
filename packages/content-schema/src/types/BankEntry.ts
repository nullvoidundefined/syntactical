// A manifest entry for one question bank: path, content hash, content version, and topic counts.
export type BankEntry = {
  path: string;
  hash: string;
  contentVersion: number;
  topicCounts: Record<string, number>;
};
