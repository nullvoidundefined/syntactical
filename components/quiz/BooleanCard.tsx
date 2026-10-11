// A True/False statement with two large choices that show correct and
// incorrect once answered. Each button's name comes from its visible key hint
// and word, plus the state as visually hidden text, so the name always
// contains the visible label (WCAG 2.5.3).
import type { Grammar, Question } from '@syntactical/content-schema';
import { Pressable, Text, View } from 'react-native';

import { CodeBlock } from './CodeBlock';

type BoolQuestion = Extract<Question, { type: 'bool' }>;
type BooleanCardProps = {
  grammar: Grammar;
  isAnswered: boolean;
  onSelect: (value: boolean) => void;
  question: BoolQuestion;
  submittedAnswer: number | boolean | null;
};

const OPTIONS = [
  { keyHint: 'T', label: 'True', value: true },
  { keyHint: 'F', label: 'False', value: false },
] as const;

function describeOption(
  value: boolean,
  answer: boolean,
  submittedAnswer: number | boolean | null,
  isAnswered: boolean,
) {
  if (isAnswered && value === answer) return { state: 'correct', toneClass: 'border-signal bg-signal/10' };
  if (isAnswered && value === submittedAnswer) return { state: 'incorrect', toneClass: 'border-danger bg-danger/10' };
  return { state: undefined, toneClass: 'border-line' };
}

export function BooleanCard({ grammar, isAnswered, onSelect, question, submittedAnswer }: BooleanCardProps) {
  const { answer, code, prompt } = question;
  return (
    <View>
      <Text className="text-lg leading-relaxed text-ink">{prompt}</Text>
      {code ? <CodeBlock className="mt-4" code={code} grammar={grammar} /> : null}
      <View className="mt-6 flex-row gap-2">
        {OPTIONS.map(({ keyHint, label, value }) => {
          const { state, toneClass } = describeOption(value, answer, submittedAnswer, isAnswered);
          return (
            <Pressable
              key={label}
              role="button"
              disabled={isAnswered}
              onPress={() => onSelect(value)}
              className={`flex-1 flex-row items-center justify-center gap-3 rounded-md border px-4 py-5 ${toneClass}`}
            >
              <Text className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted">{keyHint}</Text>
              <Text className="font-mono text-base text-ink">{label}</Text>
              {state ? <Text className="sr-only">{`, ${state}`}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
