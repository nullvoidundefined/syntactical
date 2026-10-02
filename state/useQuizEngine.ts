// Drives one round. The shuffled question list is a snapshot taken when
// the round mounts, so a bank refresh that lands mid-round changes
// nothing until the next round. An answer that does not fit the current
// question (a choice index it does not have, or the wrong kind of answer)
// is ignored rather than recorded as wrong.
import { useState } from 'react';

import type { Question } from '../services/content/types/Question';
import { calculateAccuracy } from '../services/quiz/calculateAccuracy';
import { isAnswerCorrect } from '../services/quiz/isAnswerCorrect';
import { shuffleQuestions } from '../services/quiz/shuffleQuestions';

type SubmittedAnswer = number | boolean | null;

export function useQuizEngine(bankQuestions: readonly Question[]) {
  const [questions] = useState(() => shuffleQuestions(bankQuestions));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submittedAnswer, setSubmittedAnswer] = useState<SubmittedAnswer>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const isComplete = currentIndex >= questions.length;
  const currentQuestion = isComplete ? null : questions[currentIndex];
  const isAnswered = submittedAnswer !== null;
  const wasCorrect = isAnswered && currentQuestion !== null && isAnswerCorrect(currentQuestion, submittedAnswer);

  function fitsCurrentQuestion(question: Question, value: number | boolean): boolean {
    if (question.type === 'bool') return typeof value === 'boolean';
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < question.choices.length;
  }

  function submitAnswer(value: number | boolean): boolean | null {
    if (isAnswered || !currentQuestion || !fitsCurrentQuestion(currentQuestion, value)) return null;
    const isCorrect = isAnswerCorrect(currentQuestion, value);
    setSubmittedAnswer(value);
    if (isCorrect) setCorrectCount((count) => count + 1);
    return isCorrect;
  }

  function advanceQuestion(): void {
    if (!isAnswered) return;
    setSubmittedAnswer(null);
    setCurrentIndex((index) => index + 1);
  }

  return {
    accuracy: calculateAccuracy(correctCount, questions.length),
    advanceQuestion,
    correctCount,
    currentIndex,
    currentQuestion,
    isAnswered,
    isComplete,
    submitAnswer,
    submittedAnswer,
    totalQuestions: questions.length,
    wasCorrect,
  };
}
