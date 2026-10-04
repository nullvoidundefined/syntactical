// Transient provider failures in a row that abort a fillBank run, so a dead provider
// stops the run instead of dropping every remaining draft.
export const MAX_CONSECUTIVE_PROVIDER_FAILURES = 5;
