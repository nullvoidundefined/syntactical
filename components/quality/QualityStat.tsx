// One labeled number on the quality page. The list item carries the spoken
// "label: value" (aria-label is only valid on an element with a role), and the
// visible texts are hidden from assistive tech so nothing is read twice.
import { Text, View } from 'react-native';

type QualityStatProps = { label: string; value: string };

export function QualityStat({ label, value }: QualityStatProps) {
  return (
    <View role="listitem" aria-label={`${label}: ${value}`} className="flex-row items-center justify-between border-b border-line py-2">
      <Text aria-hidden className="font-mono text-xs text-muted">
        {label}
      </Text>
      <Text aria-hidden className="font-mono text-sm text-ink">
        {value}
      </Text>
    </View>
  );
}
