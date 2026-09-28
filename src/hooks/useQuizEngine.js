// Drives a single quiz round: question order, the currently answered
// state, running score, and advancing to the next question or to
// completion. Delegates grading and shuffling to services/quizService.

import { useMemo, useState } from 'react';
import { getQuestionBank } from '../data/index.js';
import { calculateAccuracy, isAnswerCorrect, shuffleQuestions } from '../services/quizService.js';

/**
 * @param {{language: string, difficulty: string}} track
 */
export function useQuizEngine({ language, difficulty }) {
  const questions = useMemo(
    () => shuffleQuestions(getQuestionBank(language, difficulty)),
    [language, difficulty],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [submittedAnswer, setSubmittedAnswer] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);

  const isComplete = currentIndex >= questions.length;
  const currentQuestion = isComplete ? null : questions[currentIndex];
  const isAnswered = submittedAnswer !== null;
  const wasCorrect = isAnswered && currentQuestion
    ? isAnswerCorrect(currentQuestion, submittedAnswer)
    : false;

  function submitAnswer(value) {
    if (isAnswered || isComplete) return null;
    const correct = isAnswerCorrect(currentQuestion, value);
    setSubmittedAnswer(value);
    if (correct) setCorrectCount((count) => count + 1);
    return correct;
  }

  function advanceQuestion() {
    if (!isAnswered) return;
    setSubmittedAnswer(null);
    setCurrentIndex((index) => index + 1);
  }

  return {
    questions,
    currentQuestion,
    currentIndex,
    totalQuestions: questions.length,
    submittedAnswer,
    isAnswered,
    isComplete,
    wasCorrect,
    correctCount,
    accuracy: calculateAccuracy(correctCount, questions.length),
    submitAnswer,
    advanceQuestion,
  };
}
