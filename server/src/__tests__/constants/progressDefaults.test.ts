import { DEFAULT_DAILY_GOAL } from '@syntactical/progress';
import { expect, it } from 'vitest';

import { PROGRESS_DEFAULTS } from '../../constants/progressDefaults.js';

it('uses the package DEFAULT_DAILY_GOAL as the server default', () => {
  expect(PROGRESS_DEFAULTS.DAILY_GOAL).toBe(DEFAULT_DAILY_GOAL);
});
