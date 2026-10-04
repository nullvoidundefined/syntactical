// The daily goal radio group (10, 20, or 50 XP), keyboard-operable as the
// WAI-ARIA radio group pattern on the web: one tab stop (the selected goal),
// and the arrow keys move both focus and the selection, wrapping at the ends.
// Right and Down go to the next goal, Left and Up to the previous one. While
// a change is being saved the options are disabled and the arrows do nothing.
import { useRef } from 'react';

import { Platform, Pressable, Text, View } from 'react-native';

import { DAILY_GOALS } from '@syntactical/progress';

type DailyGoalPickerProps = {
  isBusy: boolean;
  labelledBy: string;
  onSelect: (goal: number) => void;
  selectedGoal: number;
};

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

function readStep(key: string): number {
  if (NEXT_KEYS.has(key)) return 1;
  if (PREVIOUS_KEYS.has(key)) return -1;
  return 0;
}

export function DailyGoalPicker({ isBusy, labelledBy, onSelect, selectedGoal }: DailyGoalPickerProps) {
  const optionRefs = useRef<(View | null)[]>([]);
  const isWeb = Platform.OS === 'web';
  const selectedIndex = Math.max(
    0,
    DAILY_GOALS.findIndex((goal) => goal === selectedGoal),
  );

  function handleKeyDown(event: { key: string; preventDefault: () => void }, index: number) {
    const step = readStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    if (isBusy) return;
    const { length } = DAILY_GOALS;
    const nextIndex = (index + step + length) % length;
    (optionRefs.current[nextIndex] as unknown as HTMLElement | null)?.focus();
    onSelect(DAILY_GOALS[nextIndex]);
  }

  return (
    <View role="radiogroup" aria-labelledby={labelledBy} className="mt-4 flex-row gap-2">
      {DAILY_GOALS.map((goal, index) => {
        const isSelected = goal === selectedGoal;
        const webProps = isWeb
          ? { onKeyDown: (event: { key: string; preventDefault: () => void }) => handleKeyDown(event, index), tabIndex: index === selectedIndex ? 0 : -1 }
          : {};
        return (
          <Pressable
            key={goal}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isBusy}
            aria-label={`${goal} XP a day`}
            disabled={isBusy}
            onPress={() => onSelect(goal)}
            className={`flex-1 items-center border px-4 py-3 ${isSelected ? 'border-signal bg-signal' : 'border-line'}`}
            {...(webProps as object)}
          >
            <Text className={`font-mono text-sm ${isSelected ? 'text-obsidian' : 'text-ink'}`}>{`${goal} XP`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
