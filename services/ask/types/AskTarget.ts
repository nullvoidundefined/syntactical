// The question an ask is about, as the server knows it: its bank (`language/difficulty`), its id,
// and the bank-order index of the choice the learner picked.
export type AskTarget = { bankKey: string; choiceIndex: number; questionId: string };
