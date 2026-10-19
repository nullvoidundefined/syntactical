import { CHOICE_KEYS_PER_ROW } from '../../constants/appConfig';

// A hint only for an item a bound key reaches; later items stay mouse and Tab operable.
export function pickKeyHint(position: number): number | undefined {
  return position <= CHOICE_KEYS_PER_ROW ? position : undefined;
}
