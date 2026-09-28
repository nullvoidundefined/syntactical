// Chrome shared by every question card: the track/type header row, the
// always-present Query trigger, and a slot for the type-specific body
// (MultipleChoiceCard or BooleanCard). The body keeps a min-height so a
// short True/False card and a tall multiple-choice card with a code block
// occupy the same vertical space, and advancing a question does not jump
// the Continue row or the keyboard hint bar.

import { DIFFICULTIES, LANGUAGES } from '../../constants/appConfig.js';

const TYPE_LABEL = {
  mc: 'Multiple choice',
  bool: 'True / False',
};

export function Card({ language, difficulty, type, onOpenQuery, children }) {
  const languageLabel = LANGUAGES.find((entry) => entry.id === language)?.label ?? language;
  const difficultyLabel = DIFFICULTIES.find((entry) => entry.id === difficulty)?.label ?? difficulty;

  return (
    <div className="border border-line rounded-lg bg-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-y-2 justify-between px-4 py-3 sm:px-5 border-b border-line/60">
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-[10px] sm:text-[11px] tracking-widest text-muted uppercase">
          <span>{languageLabel}</span>
          <span className="text-line">/</span>
          <span>{difficultyLabel}</span>
          <span className="hidden sm:inline text-line">/</span>
          <span className="hidden sm:inline">{TYPE_LABEL[type]}</span>
        </div>
        <button
          type="button"
          onClick={onOpenQuery}
          className="font-mono text-[10px] sm:text-[11px] tracking-widest uppercase text-muted border border-line rounded px-2 py-1
                     hover:border-signal/60 hover:text-signal transition-colors"
        >
          Query <span className="hidden sm:inline text-line">(Q)</span>
        </button>
      </div>
      <div className="px-4 py-5 sm:px-5 sm:py-6 min-h-[22rem] sm:min-h-[32rem]">{children}</div>
    </div>
  );
}
