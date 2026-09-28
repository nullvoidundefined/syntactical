// Step 1 of the launch wizard: choose a language track.

import { LANGUAGES } from '../../constants/appConfig.js';
import { SelectionCard } from './SelectionCard.jsx';

export function LanguageStep({ onSelectLanguage }) {
  return (
    <div>
      <p className="font-mono text-xs tracking-[0.25em] text-muted uppercase mb-4">
        Step 1 / Select track
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {LANGUAGES.map((language, index) => (
          <SelectionCard
            key={language.id}
            keyHint={index + 1}
            title={language.label}
            subtitle={language.tagline}
            onSelect={() => onSelectLanguage(language.id)}
          />
        ))}
      </div>
    </div>
  );
}
