// DifficultyStep and LengthStep cannot be handed more than four cards through their props, so the
// cap on number hints is tested on the helper every menu step uses to pick a card's hint.
import { CHOICE_KEYS_PER_ROW, KEY_BINDINGS } from '../../../constants/appConfig';
import { pickKeyHint } from '../pickKeyHint';

describe('pickKeyHint', () => {
  it('counts one choice key per position in a row, half the bindings', () => {
    expect(CHOICE_KEYS_PER_ROW).toBe(KEY_BINDINGS.choice.length / 2);
    expect(CHOICE_KEYS_PER_ROW).toBe(4);
  });

  it('returns the 1-based position for each position a choice key selects', () => {
    expect([1, 2, 3, 4].map(pickKeyHint)).toEqual([1, 2, 3, 4]);
  });

  it('returns no hint for a position past the per-row choice keys', () => {
    expect(pickKeyHint(5)).toBeUndefined();
    expect(pickKeyHint(12)).toBeUndefined();
  });
});
