// Storage keys and the budget for the on-device content cache.
export const CONTENT_CACHE_KEYS = {
  // When each cached non-bundled bank was last written or played: { "<language>/<difficulty>": ms }.
  bankIndex: 'syntactical.content.v1.bankIndex',
  bankPrefix: 'syntactical.content.v1.bank.',
  manifest: 'syntactical.content.v1.manifest',
  // Owner-scoped caches of the retired paid banks; removed at startup.
  retiredPaidBankPrefix: 'syntactical.content.v1.paid.',
} as const;

export const BANK_STORE = {
  // Cached Medium and Hard banks kept on the device, about 2.4 MB at about 400 KB each.
  MAX_CACHED_BANKS: 6,
} as const;
