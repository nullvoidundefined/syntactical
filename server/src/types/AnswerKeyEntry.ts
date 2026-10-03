// One question's answer for server-side correctness: the correct choice index and how many
// choices the question has (a bool question has two: True is 0, False is 1).
type AnswerKeyEntry = { answerIndex: number; choiceCount: number };

export type { AnswerKeyEntry };
