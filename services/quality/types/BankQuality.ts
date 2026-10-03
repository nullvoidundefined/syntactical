// One bank's audit counts, keyed `language/difficulty`.
export type BankQuality = { audited: number; bankKey: string; failed: number; notExecutable: number; passed: number };
