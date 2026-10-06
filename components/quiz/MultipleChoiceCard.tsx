// A multiple-choice question: prompt, optional code, and up to four
// lettered choices that show correct and incorrect once answered.
import type { Grammar, Question } from '@syntactical/content-schema';
import { Pressable, Text, View } from 'react-native';

import { CodeBlock } from './CodeBlock';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

type McQuestion = Extract<Question, { type: 'mc' }>;
type MultipleChoiceCardProps = {
  grammar: Grammar;
  isAnswered: boolean;
  onSelect: (index: number) => void;
  question: McQuestion;
  submittedAnswer: number | boolean | null;
};

function describeChoice(
  index: number,
  answerIndex: number,
  submittedAnswer: number | boolean | null,
  isAnswered: boolean,
) {
  if (isAnswered && index === answerIndex) return { state: 'correct', toneClass: 'border-signal bg-signal/10' };
  if (isAnswered && index === submittedAnswer) return { state: 'incorrect', toneClass: 'border-danger bg-danger/10' };
  return { state: undefined, toneClass: 'border-line' };
}

// The name starts with the visible letter so it contains the visible label (WCAG 2.5.3).
function describeName(letter: string, text: string, state: string | undefined) {
  return state ? `${letter}, ${text}, ${state}` : `${letter}, ${text}`;
}

export function MultipleChoiceCard({
  grammar,
  isAnswered,
  onSelect,
  question,
  submittedAnswer,
}: MultipleChoiceCardProps) {
  const { answerIndex, choices, code, prompt } = question;
  return (
    <View>
      <Text className="text-lg leading-relaxed text-ink">{prompt}</Text>
      {code ? <CodeBlock className="mt-4" code={code} grammar={grammar} /> : null}
      <View className="mt-6 gap-2">
        {choices.map((choice, index) => {
          const { state, toneClass } = describeChoice(index, answerIndex, submittedAnswer, isAnswered);
          return (
            <Pressable
              key={`${index}-${choice.text}`}
              role="button"
              disabled={isAnswered}
              aria-label={describeName(CHOICE_LABELS[index], choice.text, state)}
              onPress={() => onSelect(index)}
              className={`flex-row items-center gap-3 rounded-md border px-4 py-3 ${toneClass}`}
            >
              <Text className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted">
                {CHOICE_LABELS[index]}
              </Text>
              <Text className="flex-1 text-sm text-ink">{choice.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
