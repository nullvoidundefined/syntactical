import { DIFFICULTIES } from '@syntactical/content-schema';

import { findDifficulty } from '../findDifficulty';

describe('findDifficulty', () => {
  it('finds the Easy entry', () => {
    const entry = findDifficulty('easy');
    expect(entry).toBe(DIFFICULTIES.find((difficulty) => difficulty.id === 'easy'));
    expect(entry?.label).toBe('Easy');
  });

  it('returns undefined for an unknown difficulty', () => {
    expect(findDifficulty('impossible')).toBeUndefined();
  });
});
