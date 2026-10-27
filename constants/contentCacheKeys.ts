// Storage keys and the budget for the on-device content cache.
// The direct sponsor is cached under its own key, without a hash.
export const CONTENT_CACHE_KEYS = {
  // When each cached non-bundled bank was last written or played: { "<language>/<difficulty>": ms }.
  bankIndex: 'syntactical.content.v1.bankIndex',
  bankPrefix: 'syntactical.content.v1.bank.',
  manifest: 'syntactical.content.v1.manifest',
  sponsor: 'syntactical.content.v1.sponsor',
  // Owner-scoped caches of the retired paid banks; removed at startup.
  retiredPaidBankPrefix: 'syntactical.content.v1.paid.',
} as const;

export const BANK_STORE = {
  // Cached Medium and Hard banks kept on the device, about 2.4 MB at about 400 KB each.
  MAX_CACHED_BANKS: 6,
} as const;
