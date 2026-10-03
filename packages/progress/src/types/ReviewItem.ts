// One review state item: a question id or a misconception id and its
// ts-fsrs card (due, stability, difficulty, reps, lapses, state).
import type { Card } from 'ts-fsrs';

export type ReviewItem = { card: Card; id: string };
