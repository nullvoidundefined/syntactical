// Pure business logic for running a quiz round: shuffling, grading, and
// scoring. No React, no storage, no DOM - safe to unit test in isolation.

/**
 * Return a new array with the same items in randomized order (Fisher-Yates).
 * @param {Array<*>} items
 */
export function shuffleQuestions(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Determine whether a submitted answer is correct for a given question.
 * @param {object} question
 * @param {number|boolean} submitted - choice index for 'mc', boolean for 'bool'
 */
export function isAnswerCorrect(question, submitted) {
  if (question.type === 'bool') return submitted === question.answer;
  return submitted === question.answerIndex;
}

/**
 * Compute the accuracy percentage for a round.
 * @param {number} correctCount
 * @param {number} totalCount
 * @returns {number} rounded percentage, 0 when totalCount is 0
 */
export function calculateAccuracy(correctCount, totalCount) {
  if (totalCount === 0) return 0;
  return Math.round((correctCount / totalCount) * 100);
}
