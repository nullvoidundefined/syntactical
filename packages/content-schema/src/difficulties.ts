// The difficulty registry: each difficulty's id, label, and description.
export const DIFFICULTIES = [
  {
    description: 'Foundational syntax and idioms, still language-specific.',
    id: 'easy',
    label: 'Easy',
  },
  { description: 'Core syntax and everyday behavior.', id: 'medium', label: 'Medium' },
  {
    description: 'Internals, edge cases, and the questions that bite in review.',
    id: 'hard',
    label: 'Hard',
  },
] as const;

export type DifficultyId = (typeof DIFFICULTIES)[number]['id'];
