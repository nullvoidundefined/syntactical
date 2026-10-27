// Whether a user has Pro now, from which product, and until when (spec "2. Pro", Server), by the
// hasPro rule. The lifetime product wins when both rows are active. expiresAt is the winning row's
// expires_at as an ISO timestamp: set for the annual subscription, null for lifetime and admin grants.
interface ProStatus {
  expiresAt: string | null;
  isActive: boolean;
  product: 'annual' | 'lifetime' | null;
}

export type { ProStatus };
