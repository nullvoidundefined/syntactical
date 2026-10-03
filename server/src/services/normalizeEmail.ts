// The one form of an email used for every rate-limit key, lookup, and stored row:
// trimmed, NFKC-normalized (so compatibility characters collapse), and lowercased.
function normalizeEmail(raw: string): string {
  return raw.trim().normalize('NFKC').toLowerCase();
}

export { normalizeEmail };
