import { DEFAULT_DAILY_GOAL, findGoal } from '@syntactical/progress';

import { DEFAULT_DAILY_GOAL as APP_DEFAULT } from '../../../constants/appConfig';
import { findGoalForDate } from '../findGoalForDate';

describe('findGoalForDate', () => {
  const history = [
    { from: '2026-03-10', goal: 50 },
    { from: '2026-03-01', goal: 10 },
  ];

  it.each(['2026-03-09', '2026-03-10', '2026-03-11', '2026-02-28'])(
    'matches the package findGoal on boundary date %s with unsorted history',
    (localDate) => {
      expect(findGoalForDate(history, localDate)).toBe(findGoal(history, localDate));
    },
  );

  it('returns the package DEFAULT_DAILY_GOAL for an empty history', () => {
    expect(findGoalForDate([], '2026-03-10')).toBe(DEFAULT_DAILY_GOAL);
  });
});

it('uses the package DEFAULT_DAILY_GOAL as the app default', () => {
  expect(APP_DEFAULT).toBe(DEFAULT_DAILY_GOAL);
});
