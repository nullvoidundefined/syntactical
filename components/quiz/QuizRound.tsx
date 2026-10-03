// One round: wires the engine to the cards, the query drawer, and stats,
// and switches to the results screen when the round completes. Answers
// are refused while the drawer is open, and advancing closes it.
import type { Grammar, Question } from '@syntactical/content-schema';
import { useState } from 'react';

import { Pressable, ScrollView, Text, View } from 'react-native';

import { useQuizStats } from '../../state/StatsProvider';
import { useQuizEngine, type PlayableQuestion } from '../../state/useQuizEngine';
import { useRoundCompletion } from '../../state/useRoundCompletion';
import { useRoundKeyboard } from '../../state/useRoundKeyboard';
import { QueryDrawer } from '../query/QueryDrawer';

import { BooleanCard } from './BooleanCard';
import { KeyboardHintBar } from './KeyboardHintBar';
import { MultipleChoiceCard } from './MultipleChoiceCard';
import { ProgressBar } from './ProgressBar';
import { QuestionCardFrame } from './QuestionCardFrame';
import { ResultsScreen } from './ResultsScreen';

type QuizRoundProps = {
  difficulty: string;
  difficultyLabel: string;
  grammar: Grammar;
  language: string;
  languageLabel: string;
  onExit: () => void;
  onRetry: () => void;
  questions: readonly Question[];
};

type QuestionCardProps = {
  answerState: { grammar: Grammar; isAnswered: boolean; submittedAnswer: number | boolean | null };
  difficultyLabel: string;
  languageLabel: string;
  onAnswer: (value: number | boolean) => void;
  onOpenQuery: () => void;
  question: PlayableQuestion;
};

function QuestionCard({ answerState, difficultyLabel, languageLabel, onAnswer, onOpenQuery, question }: QuestionCardProps) {
  const labels = { difficultyLabel, languageLabel, onOpenQuery };
  return question.type === 'mc' ? (
    <QuestionCardFrame {...labels} type="mc">
      <MultipleChoiceCard question={question} {...answerState} onSelect={onAnswer} />
    </QuestionCardFrame>
  ) : (
    <QuestionCardFrame {...labels} type="bool">
      <BooleanCard question={question} {...answerState} onSelect={onAnswer} />
    </QuestionCardFrame>
  );
}

function AnswerActions({ onAdvance, onExplain, wasCorrect }: { onAdvance: () => void; onExplain: () => void; wasCorrect: boolean }) {
  return (
    <View className="mt-4 gap-3">
      {wasCorrect ? null : (
        <Pressable role="button" aria-label="Explain" onPress={onExplain} className="rounded-md border border-line py-3">
          <Text className="text-center font-mono text-sm uppercase tracking-widest text-muted">Explain</Text>
        </Pressable>
      )}
      <Pressable role="button" aria-label="Continue" onPress={onAdvance} className="rounded-md bg-signal py-3">
        <Text className="text-center font-mono text-sm uppercase tracking-widest text-obsidian">Continue</Text>
      </Pressable>
    </View>
  );
}

function RoundHeader({ currentIndex, onExit, totalQuestions }: { currentIndex: number; onExit: () => void; totalQuestions: number }) {
  return (
    <>
      <View className="flex-row px-4 pt-3">
        <Pressable role="button" aria-label="Back to menu" onPress={onExit}>
          <Text className="font-mono text-xs text-muted">Back</Text>
        </Pressable>
      </View>
      <ProgressBar current={currentIndex} total={totalQuestions} />
    </>
  );
}

export function QuizRound(props: QuizRoundProps) {
  const { difficulty, difficultyLabel, grammar, language, languageLabel, onExit, onRetry, questions } = props;
  const engine = useQuizEngine(questions);
  const { advanceQuestion, currentQuestion, isAnswered, isComplete, submitAnswer, submittedAnswer, wasCorrect } = engine;
  const { recordAnswer } = useQuizStats();
  const [isQueryOpen, setIsQueryOpen] = useState(false);
  // A round with no playable questions (an A/B-only bank before Stage 5) is not a completion.
  useRoundCompletion(isComplete && engine.totalQuestions > 0, { difficulty, language });

  function handleAnswer(value: number | boolean) {
    if (isQueryOpen) return;
    const isCorrect = submitAnswer(value);
    if (isCorrect !== null) recordAnswer({ difficulty, language, wasCorrect: isCorrect });
  }

  function handleAdvance() {
    setIsQueryOpen(false);
    advanceQuestion();
  }

  useRoundKeyboard({
    currentType: currentQuestion?.type,
    isAnswered,
    isComplete,
    isQueryOpen,
    onAdvance: handleAdvance,
    onAnswer: handleAnswer,
    onExit,
    setIsQueryOpen,
  });

  if (isComplete || !currentQuestion) {
    const { accuracy, correctCount, totalQuestions } = engine;
    const results = { accuracy, correctCount, difficultyLabel, languageLabel, totalQuestions };
    return <ResultsScreen {...results} onMenu={onExit} onRetry={onRetry} />;
  }

  const answerState = { grammar, isAnswered, submittedAnswer };
  const { currentIndex, totalQuestions } = engine;
  const { query, type } = currentQuestion;
  return (
    <View className="flex-1">
      <RoundHeader currentIndex={currentIndex} onExit={onExit} totalQuestions={totalQuestions} />
      <ScrollView contentContainerClassName="flex-grow items-center px-4 py-6">
        <View className="w-full max-w-2xl">
          <QuestionCard
            answerState={answerState}
            difficultyLabel={difficultyLabel}
            languageLabel={languageLabel}
            onAnswer={handleAnswer}
            onOpenQuery={() => setIsQueryOpen(true)}
            question={currentQuestion}
          />
          {isAnswered ? <AnswerActions onAdvance={handleAdvance} onExplain={() => setIsQueryOpen(true)} wasCorrect={wasCorrect} /> : null}
        </View>
      </ScrollView>
      <KeyboardHintBar questionType={type} isAnswered={isAnswered} />
      <QueryDrawer isOpen={isQueryOpen} query={query} grammar={grammar} onClose={() => setIsQueryOpen(false)} />
    </View>
  );
}
