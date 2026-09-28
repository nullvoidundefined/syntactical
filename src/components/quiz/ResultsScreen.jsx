// Shown once every question in a round has been answered: final score,
// accuracy, and the choice to run the same track again or return to menu.

import { DIFFICULTIES, LANGUAGES } from '../../constants/appConfig.js';
import { useKeyboardNav } from '../../hooks/useKeyboardNav.js';

export function ResultsScreen({ language, difficulty, correctCount, totalQuestions, accuracy, onRetry, onMenu }) {
  useKeyboardNav({ onAdvance: onRetry, onEscape: onMenu });

  const languageLabel = LANGUAGES.find((entry) => entry.id === language)?.label ?? language;
  const difficultyLabel = DIFFICULTIES.find((entry) => entry.id === difficulty)?.label ?? difficulty;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 text-center">
      <p className="font-mono text-xs tracking-[0.25em] text-muted uppercase mb-3">
        {languageLabel} / {difficultyLabel} / Complete
      </p>
      <p className="font-mono text-5xl sm:text-6xl text-signal tracking-tight">{accuracy}%</p>
      <p className="mt-3 text-sm text-muted">
        {correctCount} of {totalQuestions} correct
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
        <button
          type="button"
          onClick={onRetry}
          className="font-mono text-sm tracking-wide uppercase border border-signal/60 text-signal rounded px-5 py-2.5
                     hover:bg-signal/10 transition-colors"
        >
          Retry <span className="hidden sm:inline text-signal/60">(Enter)</span>
        </button>
        <button
          type="button"
          onClick={onMenu}
          className="font-mono text-sm tracking-wide uppercase border border-line text-muted rounded px-5 py-2.5
                     hover:border-ink/60 hover:text-ink transition-colors"
        >
          Menu <span className="hidden sm:inline text-line">(Esc)</span>
        </button>
      </div>
    </div>
  );
}
