// Shown when a round ends: accuracy, correct count, Retry or Menu, and for a
// guest the one-time sign-up prompt. Enter retries; Enter on a focused
// button activates that button only, since the pressable consumes the key.
// Dismissing the prompt hands focus to Retry, since the focused button is
// removed with the prompt.
import { useRef } from 'react';

import { Pressable, Text, View } from 'react-native';

import { useKeyboardNav } from '../../state/useKeyboardNav';
import { SignUpPrompt } from '../auth/SignUpPrompt';

type ResultsScreenProps = {
  accuracy: number;
  correctCount: number;
  difficultyLabel: string;
  languageLabel: string;
  onMenu: () => void;
  onRetry: () => void;
  totalQuestions: number;
};

export function ResultsScreen({ accuracy, correctCount, difficultyLabel, languageLabel, onMenu, onRetry, totalQuestions }: ResultsScreenProps) {
  useKeyboardNav({ onAdvance: onRetry, onEscape: onMenu });
  const retryRef = useRef<View>(null);
  return (
    <View className="flex-1 items-center justify-center px-4 py-8">
      <Text role="heading" aria-level={1} className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
        {`${languageLabel} / ${difficultyLabel} / Complete`}
      </Text>
      <Text className="font-mono text-5xl text-signal">{`${accuracy}%`}</Text>
      <Text className="mt-3 text-sm text-muted">{`${correctCount} of ${totalQuestions} correct`}</Text>
      <View className="mt-10 w-full max-w-xs gap-3">
        <Pressable ref={retryRef} role="button" aria-label="Retry" onPress={onRetry} className="rounded bg-signal px-5 py-2.5">
          <Text className="text-center font-mono text-sm uppercase text-obsidian">Retry</Text>
        </Pressable>
        <Pressable role="button" aria-label="Menu" onPress={onMenu} className="rounded border border-line px-5 py-2.5">
          <Text className="text-center font-mono text-sm uppercase text-muted">Menu</Text>
        </Pressable>
      </View>
      <SignUpPrompt onDismissed={() => retryRef.current?.focus?.()} />
    </View>
  );
}
