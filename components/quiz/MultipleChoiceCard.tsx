// A multiple-choice question: prompt, optional code, and up to four
// lettered choices that show correct and incorrect once answered.
import { Pressable, Text, View } from 'react-native';

import type { Grammar } from '../../constants/appConfig';
import type { Question } from '../../services/content/types/Question';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

type McQuestion = Extract<Question, { type: 'mc' }>;
type MultipleChoiceCardProps = {
  grammar: Grammar;
  isAnswered: boolean;
  onSelect: (index: number) => void;
  question: McQuestion;
  submittedAnswer: number | boolean | null;
};

function describeChoice(index: number, answerIndex: number, submittedAnswer: number | boolean | null, isAnswered: boolean) {
  if (isAnswered && index === answerIndex) return { state: 'correct', toneClass: 'border-signal bg-signal/10' };
  if (isAnswered && index === submittedAnswer) return { state: 'incorrect', toneClass: 'border-danger bg-danger/10' };
  return { state: undefined, toneClass: 'border-line' };
}

export function MultipleChoiceCard({ isAnswered, onSelect, question, submittedAnswer }: MultipleChoiceCardProps) {
  const { answerIndex, choices, code, prompt } = question;
  return (
    <View>
      <Text className="text-lg leading-relaxed text-ink">{prompt}</Text>
      {code ? <Text className="mt-4 font-mono text-sm text-ink">{code}</Text> : null}
      <View className="mt-6 gap-2">
        {choices.map((choice, index) => {
          const { state, toneClass } = describeChoice(index, answerIndex, submittedAnswer, isAnswered);
          return (
            <Pressable
              key={`${index}-${choice}`}
              role="button"
              disabled={isAnswered}
              aria-label={state ? `${choice}, ${state}` : choice}
              onPress={() => onSelect(index)}
              className={`flex-row items-center gap-3 rounded-md border px-4 py-3 ${toneClass}`}
            >
              <Text className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted">{CHOICE_LABELS[index]}</Text>
              <Text className="flex-1 text-sm text-ink">{choice}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
