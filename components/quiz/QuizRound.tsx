// One round: wires the engine to the cards, the query drawer, and stats,
// and switches to the results screen when the round completes. Answers
// are refused while the drawer is open, and advancing closes it. A bank
// round plays one bank, or one topic of it; a review round mixes banks, so
// each question's bank, labels, and grammar come from describeQuestion. Only a
// round that plays every question in the bank records a bank completion: a
// sampled 20 or 50 question round, a topic round, and a review round do not.
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Grammar, Question } from '@syntactical/content-schema';

import { readEvidenceSource } from '../../services/quiz/readEvidenceSource';
import { resolveQuestionGrammar } from '../../services/quiz/resolveQuestionGrammar';
import { readChosenRationale } from '../../services/quiz/readChosenRationale';
import { toChoiceIndex } from '../../services/quiz/toChoiceIndex';
import type { RecordedAnswer } from '../../services/stats/types/RecordedAnswer';
import { useQuizStats } from '../../state/StatsProvider';
import { useQueryDrawer } from '../../state/useQueryDrawer';
import { useQuizEngine, type RoundKind } from '../../state/useQuizEngine';
import { useRoundAnalytics } from '../../state/useRoundAnalytics';
import { useRoundCompletion } from '../../state/useRoundCompletion';
import { useRoundKeyboard } from '../../state/useRoundKeyboard';
import { QueryDrawer } from '../query/QueryDrawer';

import { AbCard } from './AbCard';
import { BooleanCard } from './BooleanCard';
import { KeyboardHintBar } from './KeyboardHintBar';
import { MultipleChoiceCard } from './MultipleChoiceCard';
import { ProgressBar } from './ProgressBar';
import { QuestionCardFrame } from './QuestionCardFrame';
import { ResultsScreen } from './ResultsScreen';

export type QuestionSource = {
  difficulty: string;
  difficultyLabel: string;
  grammar: Grammar;
  language: string;
  languageLabel: string;
};

type QuizRoundProps = QuestionSource & {
  describeQuestion?: (question: Question) => QuestionSource;
  onExit: () => void;
  onRetry: () => void;
  questions: readonly Question[];
  roundKind?: RoundKind;
  sampleSize?: number;
  topic?: string;
};

type QuestionCardProps = {
  answerState: { grammar: Grammar; isAnswered: boolean; submittedAnswer: number | boolean | null };
  difficultyLabel: string;
  languageLabel: string;
  onAnswer: (value: number | boolean) => void;
  onOpenQuery: () => void;
  question: Question;
};

type CardBodyProps = Pick<QuestionCardProps, 'answerState' | 'onAnswer' | 'question'>;

function CardBody({ answerState, onAnswer, question }: CardBodyProps) {
  if (question.type === 'mc') return <MultipleChoiceCard question={question} {...answerState} onSelect={onAnswer} />;
  if (question.type === 'ab') return <AbCard question={question} {...answerState} onSelect={onAnswer} />;
  return <BooleanCard question={question} {...answerState} onSelect={onAnswer} />;
}

function QuestionCard({
  answerState,
  difficultyLabel,
  languageLabel,
  onAnswer,
  onOpenQuery,
  question,
}: QuestionCardProps) {
  const { provenance, type } = question;
  return (
    <QuestionCardFrame
      difficultyLabel={difficultyLabel}
      languageLabel={languageLabel}
      onOpenQuery={onOpenQuery}
      provenance={provenance}
      type={type}
    >
      <CardBody answerState={answerState} onAnswer={onAnswer} question={question} />
    </QuestionCardFrame>
  );
}

function AnswerActions({
  onAdvance,
  onExplain,
  wasCorrect,
}: {
  onAdvance: () => void;
  onExplain: () => void;
  wasCorrect: boolean;
}) {
  return (
    <View className="mt-4 gap-3">
      {wasCorrect ? null : (
        <Pressable
          role="button"
          aria-label="Explain"
          onPress={onExplain}
          className="rounded-md border border-line py-3"
        >
          <Text className="text-center font-mono text-sm uppercase tracking-widest text-muted">Explain</Text>
        </Pressable>
      )}
      <Pressable role="button" aria-label="Continue" onPress={onAdvance} className="rounded-md bg-signal py-3">
        <Text className="text-center font-mono text-sm uppercase tracking-widest text-obsidian">Continue</Text>
      </Pressable>
    </View>
  );
}

function RoundHeader({
  currentIndex,
  onExit,
  totalQuestions,
}: {
  currentIndex: number;
  onExit: () => void;
  totalQuestions: number;
}) {
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
  const {
    describeQuestion,
    difficulty,
    difficultyLabel,
    grammar,
    language,
    languageLabel,
    onExit,
    onRetry,
    questions,
    roundKind = 'bank',
    sampleSize,
    topic,
  } = props;
  const engine = useQuizEngine(questions, { roundKind, sampleSize, topic });
  const { advanceQuestion, currentQuestion, isAnswered, isComplete, submitAnswer, submittedAnswer, wasCorrect } =
    engine;
  const { recordAnswer } = useQuizStats();
  const { explain, isOpen: isQueryOpen, rationale: explainRationale, setOpen: updateQueryOpen } = useQueryDrawer();
  const recordedKind: RecordedAnswer['roundKind'] = roundKind === 'bank' && topic !== undefined ? 'topic' : roundKind;

  function handleExplain() {
    if (currentQuestion) explain(readChosenRationale(currentQuestion, submittedAnswer));
  }

  const isWholeBank = roundKind === 'bank' && topic === undefined && engine.totalQuestions === questions.length;
  useRoundCompletion(isComplete && engine.totalQuestions > 0 && isWholeBank, { difficulty, language });
  useRoundAnalytics({
    bankQuestions: questions,
    correctCount: engine.correctCount,
    difficulty,
    isComplete,
    language,
    roundKind,
    topic,
    totalQuestions: engine.totalQuestions,
  });
  const roundSource = { difficulty, difficultyLabel, grammar, language, languageLabel };
  const source = currentQuestion && describeQuestion ? describeQuestion(currentQuestion) : roundSource;

  function handleAnswer(value: number | boolean) {
    if (isQueryOpen) return;
    const isCorrect = submitAnswer(value);
    if (isCorrect === null || !currentQuestion) return;
    const { id: questionId } = currentQuestion;
    const { difficulty: questionDifficulty, language: questionLanguage } = source;
    const displayedChoiceIndex = toChoiceIndex(value);
    const answer = {
      choiceIndex:
        currentQuestion.type === 'mc' ? currentQuestion.bankChoiceIndexes[displayedChoiceIndex] : displayedChoiceIndex,
      difficulty: questionDifficulty,
      language: questionLanguage,
      questionId,
      roundKind: recordedKind,
    };
    recordAnswer({ ...answer, wasCorrect: isCorrect });
  }

  function handleAdvance() {
    updateQueryOpen(false);
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
    setIsQueryOpen: updateQueryOpen,
  });

  if (isComplete || !currentQuestion) {
    const { accuracy, correctCount, totalQuestions } = engine;
    const results = { accuracy, correctCount, difficultyLabel, languageLabel, totalQuestions };
    return <ResultsScreen {...results} onMenu={onExit} onRetry={onRetry} />;
  }

  const {
    difficultyLabel: questionDifficultyLabel,
    grammar: entryGrammar,
    languageLabel: questionLanguageLabel,
  } = source;
  const questionGrammar = resolveQuestionGrammar(currentQuestion, entryGrammar);
  const answerState = { grammar: questionGrammar, isAnswered, submittedAnswer };
  const { currentIndex, totalQuestions } = engine;
  const { query, type } = currentQuestion;
  return (
    <View className="flex-1">
      <RoundHeader currentIndex={currentIndex} onExit={onExit} totalQuestions={totalQuestions} />
      <ScrollView contentContainerClassName="flex-grow items-center px-4 py-6">
        <View className="w-full max-w-2xl">
          <QuestionCard
            answerState={answerState}
            difficultyLabel={questionDifficultyLabel}
            languageLabel={questionLanguageLabel}
            onAnswer={handleAnswer}
            onOpenQuery={() => updateQueryOpen(true)}
            question={currentQuestion}
          />
          {isAnswered ? (
            <AnswerActions onAdvance={handleAdvance} onExplain={handleExplain} wasCorrect={wasCorrect} />
          ) : null}
        </View>
      </ScrollView>
      <KeyboardHintBar questionType={type} isAnswered={isAnswered} />
      <QueryDrawer
        evidenceSource={readEvidenceSource(currentQuestion)}
        chosenRationale={explainRationale}
        isOpen={isQueryOpen}
        query={query}
        grammar={questionGrammar}
        onClose={() => updateQueryOpen(false)}
      />
    </View>
  );
}
