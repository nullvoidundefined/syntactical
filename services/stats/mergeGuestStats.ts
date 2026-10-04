// Folds a guest's stats into the stats of the user who claims them. Totals,
// per-track counts, and completions add; the user's answers followed the
// guest's, so the current answer streak adds and the best streak is the
// largest of the two bests and the new current; the sign-up prompt stays
// dismissed when either dismissed it; the user's goal history wins once it
// holds a change of its own, otherwise the guest's stands; the user's sync
// cursor and its owner stay with the user.
import type { LanguageDifficultyStats } from './types/LanguageDifficultyStats';
import type { Stats } from './types/Stats';

function addCounts(base: LanguageDifficultyStats | undefined, extra: LanguageDifficultyStats): LanguageDifficultyStats {
  const { attempted, completions, correct } = base ?? { attempted: 0, completions: 0, correct: 0 };
  const { attempted: moreAttempted, completions: moreCompletions, correct: moreCorrect } = extra;
  return { attempted: attempted + moreAttempted, completions: completions + moreCompletions, correct: correct + moreCorrect };
}

function addTracks(guest: Stats['tracks'], user: Stats['tracks']): Stats['tracks'] {
  const merged: Stats['tracks'] = { ...guest };
  for (const [key, counts] of Object.entries(user)) merged[key] = addCounts(merged[key], counts);
  return merged;
}

export function mergeGuestStats(guest: Stats, user: Stats): Stats {
  const { answerStreak: guestStreak, goalHistory: guestGoals, isSignUpPromptDismissed: guestDismissed, totals: guestTotals, tracks: guestTracks } = guest;
  const { answerStreak: userStreak, goalHistory: userGoals, isSignUpPromptDismissed: userDismissed, totals: userTotals, tracks: userTracks } = user;
  const { best: guestBest, current: guestCurrent } = guestStreak;
  const { best: userBest, current: userCurrent } = userStreak;
  const { attempted: guestAttempted, correct: guestCorrect } = guestTotals;
  const { attempted: userAttempted, correct: userCorrect } = userTotals;
  const current = guestCurrent + userCurrent;
  return {
    ...user,
    answerStreak: { best: Math.max(guestBest, userBest, current), current },
    goalHistory: userGoals.length > 1 ? userGoals : guestGoals,
    isSignUpPromptDismissed: guestDismissed || userDismissed,
    totals: { attempted: guestAttempted + userAttempted, correct: guestCorrect + userCorrect },
    tracks: addTracks(guestTracks, userTracks),
  };
}
