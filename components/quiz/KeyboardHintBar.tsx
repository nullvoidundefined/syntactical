// Web-only footer listing the key bindings for the current card; renders
// nothing on native, where there is no keyboard to hint at.
import { Platform, Text, View } from 'react-native';

type KeyboardHintBarProps = { isAnswered: boolean; questionType: 'bool' | 'mc' };

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="rounded border border-signal/40 px-1 font-mono text-[10px] text-signal">{keys}</Text>
      <Text className="font-mono text-xs text-muted">{label}</Text>
    </View>
  );
}

function readAnswerHint(questionType: KeyboardHintBarProps['questionType']): string {
  return questionType === 'mc' ? '1-4 / A-D' : 'T / F';
}

export function KeyboardHintBar({ isAnswered, questionType }: KeyboardHintBarProps) {
  if (Platform.OS !== 'web') return null;
  return (
    <View className="flex-row flex-wrap items-center gap-5 border-t border-line px-6 py-4">
      {isAnswered ? <Hint keys="ENTER" label="next" /> : <Hint keys={readAnswerHint(questionType)} label="select" />}
      <Hint keys="Q" label="query" />
      <Hint keys="ESC" label="menu" />
    </View>
  );
}
