// DailyGoalRing (Task 3.12, B-64): a progressbar clamped to the goal, whose
// fill eases on the web unless the user asked for reduced motion.
import { render, screen } from '@testing-library/react';

import { DailyGoalRing } from '../DailyGoalRing';

const motion = { isReduced: false };

jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => motion.isReduced }));

describe('DailyGoalRing on the web', () => {
  afterEach(() => {
    motion.isReduced = false;
  });

  it('caps the value at the goal once the goal is met and fills completely', () => {
    render(<DailyGoalRing dailyGoal={10} xpToday={14} />);
    const ring = screen.getByRole('progressbar', { name: 'Daily goal' });
    expect(ring.getAttribute('aria-valuenow')).toBe('10');
    expect(ring.getAttribute('aria-valuemin')).toBe('0');
    expect(ring.getAttribute('aria-valuetext')).toBe('14 of 10 XP');
    expect(screen.getByTestId('daily-goal-ring-fill').style.height).toBe('100%');
  });

  it('has no animation or transition under reduced motion', () => {
    motion.isReduced = true;
    render(<DailyGoalRing dailyGoal={20} xpToday={5} />);
    const { style } = screen.getByTestId('daily-goal-ring-fill');
    expect(style.animation).toMatch(/^none/);
    expect(style.transition).toMatch(/^none/);
    expect(style.height).toBe('25%');
  });

  it('eases the fill when motion is allowed', () => {
    render(<DailyGoalRing dailyGoal={20} xpToday={5} />);
    expect(screen.getByTestId('daily-goal-ring-fill').style.transitionProperty).toBe('height');
  });
});
