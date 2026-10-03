// A question of type `ab`: two options, a stated criterion, and the index of the optimal one.
import type { Question } from '@syntactical/content-schema';

export type AbQuestion = Extract<Question, { type: 'ab' }>;
