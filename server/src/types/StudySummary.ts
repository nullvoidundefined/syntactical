// What a weekly study note is written from: the week's answer counts overall and per bank, and
// the misconceptions the learner's wrong choices revealed most often, with their descriptions.
// Holds no question text, so a paid bank's content never reaches the prompt.
type StudySummary = {
  answers: number;
  banks: { answers: number; correct: number; label: string }[];
  correct: number;
  missedMisconceptions: { description: string; misses: number }[];
  reviewAnswers: number;
};

export type { StudySummary };
