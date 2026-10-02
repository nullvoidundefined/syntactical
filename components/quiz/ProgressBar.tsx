// Position within the current round, as text and as a thin bar.
import { Text, View } from 'react-native';

import { calculateAccuracy } from '../../services/quiz/calculateAccuracy';

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = calculateAccuracy(current, total);
  return (
    <View className="px-4 pt-3">
      <Text className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
        {`Q${Math.min(current + 1, total)} / ${total}`}
      </Text>
      <View
        accessible
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        className="h-1 w-full overflow-hidden rounded-full bg-line"
      >
        <View className="h-full bg-signal" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}
