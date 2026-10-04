// folded is false while the fold is in flight and true once it is persisted.
// A folded marker carries the guest totals that were folded, so a marker left
// behind is recognized as stale once the guest earns more.
export type GuestClaimSnapshot = { attempted: number; correct: number };
export type GuestClaimMarker = { folded: boolean; snapshot?: GuestClaimSnapshot; userId: string };
