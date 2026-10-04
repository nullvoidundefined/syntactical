// Today's XP against the daily goal as a small ring that fills from the
// bottom, exposed as a progressbar with its value. On the web the fill eases
// to a new value; under reduced motion it has no animation or transition.
import { Platform, View } from 'react-native';

import { useIsReducedMotion } from '../../state/useIsReducedMotion';

type DailyGoalRingProps = { dailyGoal: number; xpToday: number };

const FILL_TRANSITION = { transitionDuration: '300ms', transitionProperty: 'height' };
const NO_MOTION = { animation: 'none', transition: 'none' };
const PERCENT = 100;

export function DailyGoalRing({ dailyGoal, xpToday }: DailyGoalRingProps) {
  const isReducedMotion = useIsReducedMotion();
  const value = Math.min(xpToday, dailyGoal);
  const fillPercent = dailyGoal > 0 ? Math.round((value / dailyGoal) * PERCENT) : 0;
  const motion = isReducedMotion ? NO_MOTION : FILL_TRANSITION;
  const fillStyle = { height: `${fillPercent}%`, ...(Platform.OS === 'web' ? motion : {}) } as object;
  return (
    <View
      accessible
      role="progressbar"
      aria-label="Daily goal"
      aria-valuemin={0}
      aria-valuemax={dailyGoal}
      aria-valuenow={value}
      aria-valuetext={`${xpToday} of ${dailyGoal} XP`}
      className="h-6 w-6 justify-end overflow-hidden rounded-full border-2 border-line"
    >
      <View testID="daily-goal-ring-fill" className="w-full bg-signal" style={fillStyle} />
    </View>
  );
}
