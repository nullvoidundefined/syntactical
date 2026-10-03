// One labeled number on the quality page; the spoken label names what the number counts.
import { Text, View } from 'react-native';

type QualityStatProps = { label: string; spokenValue?: string; value: string };

export function QualityStat({ label, spokenValue, value }: QualityStatProps) {
  return (
    <View role="listitem" className="flex-row items-center justify-between border-b border-line py-2">
      <Text className="font-mono text-xs text-muted">{label}</Text>
      <Text aria-label={`${label}: ${spokenValue ?? value}`} className="font-mono text-sm text-ink">
        {value}
      </Text>
    </View>
  );
}
