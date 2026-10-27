// Crawlable text for one bank page of the web build: "What this bank covers" and the bank's distinct query titles in
// bank order, below the interactive topic step, plus the page's title, description, and canonical URL. Titles are
// written not to give answers away; no prompt, choice, answer, or explanation is rendered. The route always renders
// it, before and after hydration. It reads the build-time index and the bundled manifest, so Medium and Hard titles
// are there without bundling those banks, and the build-time render and the first client render match.
import { DIFFICULTIES } from '@syntactical/content-schema';
import { Text, View } from 'react-native';

import { BANK_TITLES } from '../../services/content/bankTitles.generated';
import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import { findLanguageEntry } from '../../services/content/findLanguageEntry';
import { describeBank } from './describeBank';
import { PageHead } from './PageHead';

type BankTitlesProps = { difficulty: string; language: string };

// Own keys only, so a route segment such as "constructor" never reads the prototype.
function readTitles(key: string): readonly string[] {
  return Object.hasOwn(BANK_TITLES, key) ? BANK_TITLES[key] : [];
}

export function BankTitles({ difficulty, language }: BankTitlesProps) {
  const titles = readTitles(`${language}/${difficulty}`);
  const languageLabel = findLanguageEntry(BUNDLED_MANIFEST.languages, language)?.label;
  const difficultyLabel = DIFFICULTIES.find(({ id }) => id === difficulty)?.label;
  if (titles.length === 0 || languageLabel === undefined || difficultyLabel === undefined) return null;
  const bankLabel = `${languageLabel} ${difficultyLabel}`;
  return (
    <View className="mt-10 gap-3">
      <PageHead
        canonicalPath={`/${language}/${difficulty}/`}
        description={describeBank(bankLabel, titles)}
        title={`${bankLabel} quiz | Syntactical`}
      />
      <Text role="heading" aria-level={2} className="font-mono text-xs uppercase tracking-widest text-muted">
        What this bank covers
      </Text>
      <View role="list" aria-label="Bank titles" className="gap-1">
        {titles.map((title) => (
          <Text key={title} role="listitem" className="text-sm text-muted">
            {title}
          </Text>
        ))}
      </View>
    </View>
  );
}
