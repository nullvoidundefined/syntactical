// One wrong choice's rationale and misconception tag. For a bool question the single wrong
// value is `choiceIndex` 0.
export interface EnrichedRationale {
    choiceIndex: number;
    misconceptionId: string;
    rationale: string;
}
