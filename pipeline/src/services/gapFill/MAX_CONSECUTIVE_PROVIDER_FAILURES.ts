// Dropped batches in a row (model timeout, non-zero exit, or unusable output) that stop a
// gap-fill run, so a dead provider costs at most this many calls instead of one per topic
// of every bank. Counted across the whole run; one usable batch resets it.
export const MAX_CONSECUTIVE_PROVIDER_FAILURES = 5;
