// Step 2 of the launch wizard: choose a difficulty tier for the already
// selected language track.

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
      <div className="grid gap-3 sm:grid-cols-2">
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
