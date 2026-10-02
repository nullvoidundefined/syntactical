// The objects that may carry a misconceptionId: a bool question itself, or
// each choice of an mc question (the correct one included).
export function listMisconceptionCarriers(question: Record<string, unknown>): unknown[] {
  if (question.type === 'bool') return [question];
  return Array.isArray(question.choices) ? question.choices : [];
}
