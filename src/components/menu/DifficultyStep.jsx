// Step 2 of the launch wizard: choose a difficulty tier for the already
// selected language track. Kept as its own component, separate from
// LanguageStep, because it depends on the language chosen in step 1
// (shown in its header) and its options render as a single vertical
// stack rather than LanguageStep's grid, deliberately differentiating
// the two steps as the language grid grows to cover many more tracks.

import { DIFFICULTIES, LANGUAGES } from '../../constants/appConfig.js';
import { SelectionCard } from './SelectionCard.jsx';

export function DifficultyStep({ language, onSelectDifficulty, onBack }) {
  const languageLabel = LANGUAGES.find((entry) => entry.id === language)?.label ?? language;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs tracking-[0.25em] text-muted uppercase">
          Step 2 / Select difficulty <span className="text-signal">{languageLabel}</span>
        </p>
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-xs text-muted hover:text-ink transition-colors"
        >
          &larr; back <span className="hidden sm:inline">(esc)</span>
        </button>
      </div>
      <div className="grid gap-3">
        {DIFFICULTIES.map((difficulty, index) => (
          <SelectionCard
            key={difficulty.id}
            keyHint={index + 1}
            title={difficulty.label}
            subtitle={difficulty.description}
            onSelect={() => onSelectDifficulty(difficulty.id)}
          />
        ))}
      </div>
    </div>
  );
}
