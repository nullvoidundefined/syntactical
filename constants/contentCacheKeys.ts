// Storage keys for the on-device content cache. A paid bank is cached under its
// owner's id, so another account on the same device never reads it.
export const CONTENT_CACHE_KEYS = {
  bankPrefix: 'syntactical.content.v1.bank.',
  manifest: 'syntactical.content.v1.manifest',
  paidBankPrefix: 'syntactical.content.v1.paid.',
} as const;
