// Orchestrates one full quiz round: wires the quiz engine to keyboard
// input, the Query drawer, and stats persistence, and switches between
// the active card and the results screen once the round is complete.
// QuizView itself only owns the "retry" remount key; QuizRound owns the
// actual in-progress round state.

import { useEffect, useState } from 'react';
import { useKeyboardNav } from '../../hooks/useKeyboardNav.js';
import { useQuizEngine } from '../../hooks/useQuizEngine.js';
import { QueryDrawer } from '../query/QueryDrawer.jsx';
import { BooleanCard } from './BooleanCard.jsx';
import { Card } from './Card.jsx';
import { KeyboardHintBar } from './KeyboardHintBar.jsx';
import { MultipleChoiceCard } from './MultipleChoiceCard.jsx';
import { ProgressBar } from './ProgressBar.jsx';
import { ResultsScreen } from './ResultsScreen.jsx';

function QuizRound({ language, difficulty, recordAnswer, recordCompletion, onExit, onRetry }) {
  const engine = useQuizEngine({ language, difficulty });
  const [isQueryOpen, setIsQueryOpen] = useState(false);

  useEffect(() => {
    if (engine.isComplete) recordCompletion({ language, difficulty });
    // Fires once per round, exactly when currentIndex first reaches the end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.isComplete]);

  function handleSelectChoice(index) {
    const wasCorrect = engine.submitAnswer(index);
    if (wasCorrect !== null) recordAnswer({ language, difficulty, wasCorrect });
  }

  function handleSelectBool(value) {
    const wasCorrect = engine.submitAnswer(value);
    if (wasCorrect !== null) recordAnswer({ language, difficulty, wasCorrect });
  }

  function handleAdvance() {
    setIsQueryOpen(false);
    engine.advanceQuestion();
  }

  function handleEscape() {
    if (isQueryOpen) {
      setIsQueryOpen(false);
      return;
    }
    onExit();
  }

  const question = engine.currentQuestion;

  useKeyboardNav({
    onSelectChoice: !isQueryOpen && question?.type === 'mc' && !engine.isAnswered ? handleSelectChoice : undefined,
    onSelectBool: !isQueryOpen && question?.type === 'bool' && !engine.isAnswered ? handleSelectBool : undefined,
    onAdvance: !isQueryOpen && engine.isAnswered ? handleAdvance : undefined,
    onToggleQuery: question ? () => setIsQueryOpen((open) => !open) : undefined,
    onEscape: handleEscape,
    enabled: !engine.isComplete,
  });

  if (engine.isComplete) {
    return (
      <ResultsScreen
        language={language}
        difficulty={difficulty}
        correctCount={engine.correctCount}
        totalQuestions={engine.totalQuestions}
        accuracy={engine.accuracy}
        onRetry={onRetry}
        onMenu={onExit}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <ProgressBar current={engine.currentIndex} total={engine.totalQuestions} />

      <div className="flex-1 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
        <div className="w-full max-w-2xl">
          <Card
            language={language}
            difficulty={difficulty}
            type={question.type}
            onOpenQuery={() => setIsQueryOpen((open) => !open)}
          >
            {question.type === 'mc' ? (
              <MultipleChoiceCard
                question={question}
                submittedAnswer={engine.submittedAnswer}
                isAnswered={engine.isAnswered}
                onSelect={handleSelectChoice}
              />
            ) : (
              <BooleanCard
                question={question}
                submittedAnswer={engine.submittedAnswer}
                isAnswered={engine.isAnswered}
                onSelect={handleSelectBool}
              />
            )}
          </Card>

          {engine.isAnswered && (
            <button
              type="button"
              onClick={handleAdvance}
              className="mt-4 w-full font-mono text-sm tracking-widest uppercase text-signal border border-signal/50
                         rounded-md py-3 hover:bg-signal/10 transition-colors"
            >
              Next <span className="hidden sm:inline text-signal/60">(Enter)</span>
            </button>
          )}
        </div>
      </div>

      <KeyboardHintBar questionType={question.type} isAnswered={engine.isAnswered} />

      <QueryDrawer isOpen={isQueryOpen} query={question.query} onClose={() => setIsQueryOpen(false)} />
    </div>
  );
}

export function QuizView({ language, difficulty, recordAnswer, recordCompletion, onExit }) {
  const [roundKey, setRoundKey] = useState(0);

  return (
    <QuizRound
      key={roundKey}
      language={language}
      difficulty={difficulty}
      recordAnswer={recordAnswer}
      recordCompletion={recordCompletion}
      onExit={onExit}
      onRetry={() => setRoundKey((current) => current + 1)}
    />
  );
}
