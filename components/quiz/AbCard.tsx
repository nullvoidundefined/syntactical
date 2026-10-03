// A "which is optimal?" question: the criterion is stated up front, both
// snippets render as labeled code blocks, and once answered the evidence for
// the criterion appears under them. Each option is a labeled group so a screen
// reader reads "Option A" before its code; the choose button names the option.
import { Pressable, Text, View } from 'react-native';

import type { Grammar, Question } from '@syntactical/content-schema';

import { AbEvidence } from './AbEvidence';
import { CodeBlock } from './CodeBlock';

const OPTION_LABELS = ['Option A', 'Option B'] as const;

type AbQuestion = Extract<Question, { type: 'ab' }>;
type AbCardProps = {
  grammar: Grammar;
  isAnswered: boolean;
  onSelect: (index: number) => void;
  question: AbQuestion;
  submittedAnswer: number | boolean | null;
};

function describeOption(index: number, answerIndex: number, submittedAnswer: number | boolean | null, isAnswered: boolean) {
  if (isAnswered && index === answerIndex) return { state: 'correct', toneClass: 'border-signal bg-signal/10' };
  if (isAnswered && index === submittedAnswer) return { state: 'incorrect', toneClass: 'border-danger bg-danger/10' };
  return { state: undefined, toneClass: 'border-line' };
}

export function AbCard({ grammar, isAnswered, onSelect, question, submittedAnswer }: AbCardProps) {
  const { answerIndex, choices, criterion, prompt } = question;
  return (
    <View>
      <Text className="text-lg leading-relaxed text-ink">{prompt}</Text>
      <View className="mt-3 rounded-md border border-line px-4 py-3">
        <Text className="font-mono text-[11px] uppercase tracking-widest text-muted">Criterion</Text>
        <Text className="mt-1 text-sm leading-relaxed text-ink">{criterion.statement}</Text>
      </View>
      <View className="mt-4 gap-4">
        {choices.map((choice, index) => {
          const label = OPTION_LABELS[index];
          const { code, text } = choice;
          const { state, toneClass } = describeOption(index, answerIndex, submittedAnswer, isAnswered);
          return (
            <View key={label} role="group" aria-label={label} className={`rounded-md border px-4 py-3 ${toneClass}`}>
              <Text className="font-mono text-xs uppercase tracking-widest text-ink">{label}</Text>
              <CodeBlock className="mt-2" code={code ?? text} grammar={grammar} />
              <Pressable
                role="button"
                disabled={isAnswered}
                aria-label={state ? `${label}, ${state}` : `Choose ${label}`}
                onPress={() => onSelect(index)}
                className="mt-3 rounded border border-line px-3 py-2"
              >
                <Text className="text-center font-mono text-xs uppercase tracking-widest text-ink">
                  {state ?? `Choose ${label}`}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {isAnswered ? <AbEvidence criterion={criterion} /> : null}
    </View>
  );
}
