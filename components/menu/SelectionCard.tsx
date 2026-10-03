// One selectable option in a menu step: key-hint badge, label, and
// description, with an optional disabled state and status label.
import { Pressable, Text, View } from 'react-native';

type SelectionCardProps = {
  ariaLabel?: string;
  isDisabled?: boolean;
  keyHint: number;
  onSelect: () => void;
  statusLabel?: string;
  subtitle: string;
  title: string;
};

export function SelectionCard({ ariaLabel, isDisabled = false, keyHint, onSelect, statusLabel, subtitle, title }: SelectionCardProps) {
  return (
    <Pressable
      role="button"
      aria-label={ariaLabel}
      disabled={isDisabled}
      onPress={onSelect}
      className={`w-full rounded-lg border border-line bg-surface px-5 py-4 ${isDisabled ? 'opacity-50' : 'active:border-signal'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-lg text-ink">{title}</Text>
        <Text aria-hidden className="rounded border border-line px-2 py-0.5 font-mono text-xs text-muted">
          {keyHint}
        </Text>
      </View>
      <Text className="mt-2 text-sm text-muted">{subtitle}</Text>
      {statusLabel ? <Text className="mt-2 font-mono text-xs text-amber">{statusLabel}</Text> : null}
    </Pressable>
  );
}
