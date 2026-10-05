// The tallies one gap-filled bank adds to the run totals; disputes are present when judging is enabled.
export interface FillBankResult {
    disputed?: number;
    duplicate: number;
    failed: number;
    generated: number;
}
