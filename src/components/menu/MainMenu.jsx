// Orchestrates the two-step launch wizard (language, then difficulty),
// wires keyboard shortcuts for each step, and surfaces cumulative stats.

import { useState } from 'react';
import { LANGUAGES, DIFFICULTIES } from '../../constants/appConfig.js';
import { useKeyboardNav } from '../../hooks/useKeyboardNav.js';
import { StatsPanel } from '../stats/StatsPanel.jsx';
import { LanguageStep } from './LanguageStep.jsx';
import { DifficultyStep } from './DifficultyStep.jsx';

export function MainMenu({ stats, onLaunch }) {
  const [language, setLanguage] = useState(null);
  const step = language === null ? 'language' : 'difficulty';

  function selectLanguageByIndex(index) {
    const chosen = LANGUAGES[index];
    if (chosen) setLanguage(chosen.id);
  }

  function selectDifficultyByIndex(index) {
    const chosen = DIFFICULTIES[index];
    if (chosen) onLaunch({ language, difficulty: chosen.id });
  }

  useKeyboardNav({
    onSelectChoice: step === 'language' ? selectLanguageByIndex : selectDifficultyByIndex,
    onEscape: step === 'difficulty' ? () => setLanguage(null) : undefined,
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-xl">
        <div className="mb-10 text-center">
          <h1 className="font-mono text-3xl tracking-tight text-ink">
            syntactical<span className="text-signal">_</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            High-velocity drills for developers who think they already know the answer.
          </p>
        </div>

        {step === 'language' ? (
          <LanguageStep onSelectLanguage={setLanguage} />
        ) : (
          <DifficultyStep
            language={language}
            onSelectDifficulty={(difficulty) => onLaunch({ language, difficulty })}
            onBack={() => setLanguage(null)}
          />
        )}

        <StatsPanel stats={stats} />
      </div>
    </div>
  );
}
