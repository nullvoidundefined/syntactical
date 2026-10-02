// A round's accuracy as a rounded percentage; 0 for an empty round.
const PERCENT = 100;

export function calculateAccuracy(correctCount: number, totalCount: number): number {
  return totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * PERCENT);
}
