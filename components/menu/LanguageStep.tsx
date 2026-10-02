// Step 1 of the launch flow: choose a language from the manifest.
import { Text, View } from 'react-native';

import type { LanguageEntry } from '../../services/content/types/LanguageEntry';
import { useKeyboardNav } from '../../state/useKeyboardNav';

import { SelectionCard } from './SelectionCard';

type LanguageStepProps = { languages: readonly LanguageEntry[]; onSelectLanguage: (languageId: string) => void };

export function LanguageStep({ languages, onSelectLanguage }: LanguageStepProps) {
  useKeyboardNav({
    onSelectChoice: (index) => {
      const language = languages[index];
      if (language) onSelectLanguage(language.id);
    },
  });
  return (
    <View>
      <Text className="mb-4 font-mono text-xs uppercase tracking-widest text-muted">Step 1 / Select language</Text>
      <View className="gap-3">
        {languages.map(({ id, label, tagline }, index) => (
          <SelectionCard key={id} keyHint={index + 1} title={label} subtitle={tagline} onSelect={() => onSelectLanguage(id)} />
        ))}
      </View>
    </View>
  );
}
