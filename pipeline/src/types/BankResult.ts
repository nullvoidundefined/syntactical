// The tallies one classified bank adds to the run totals.
export interface BankResult {
    accepted: number;
    agreed: number;
    compared: number;
    isWtfOveruse: boolean;
    queued: number;
}
