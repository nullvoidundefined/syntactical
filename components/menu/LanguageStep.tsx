// Step 1 of the launch flow: choose a language or topic track from the manifest. Entries are
// grouped by category in display order, with uncategorized entries under "More" last;
// number keys follow the displayed order across all groups.
import { TRACK_CATEGORIES, type LanguageEntry, type TrackCategory } from '@syntactical/content-schema';
import { Text, View } from 'react-native';

import { useKeyboardNav } from '../../state/useKeyboardNav';

import { SelectionCard } from './SelectionCard';

type LanguageStepProps = { languages: readonly LanguageEntry[]; onSelectLanguage: (languageId: string) => void };

const CATEGORY_HEADINGS: Record<TrackCategory, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
};
const GROUPS: readonly { heading: string; category?: TrackCategory }[] = [
  ...TRACK_CATEGORIES.map((category) => ({ heading: CATEGORY_HEADINGS[category], category })),
  { heading: 'More' },
];

export function LanguageStep({ languages, onSelectLanguage }: LanguageStepProps) {
  const groups = GROUPS.map(({ heading, category }) => ({
    entries: languages.filter((entry) => entry.category === category),
    heading,
  })).filter(({ entries }) => entries.length > 0);
  const ordered = groups.flatMap(({ entries }) => entries);
  useKeyboardNav({
    onSelectChoice: (index) => {
      const entry = ordered[index];
      if (entry) onSelectLanguage(entry.id);
    },
  });
  return (
    <View>
      <Text className="mb-4 font-mono text-xs uppercase tracking-widest text-muted">Step 1 / Select language</Text>
      {groups.map(({ entries, heading }) => (
        <View key={heading} className="mb-6">
          <Text role="heading" aria-level={2} className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
            {heading}
          </Text>
          <View className="gap-3">
            {entries.map((entry) => (
              <SelectionCard
                key={entry.id}
                keyHint={ordered.indexOf(entry) + 1}
                title={entry.label}
                subtitle={entry.tagline}
                onSelect={() => onSelectLanguage(entry.id)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
