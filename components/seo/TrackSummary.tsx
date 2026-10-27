// Crawlable text for one track page of the web build: the track label and tagline, its topics, and each bank's
// question count, below the interactive difficulty step, plus the page's title, description, and canonical URL. The
// route always renders it, before and after hydration, so both the static HTML and the DOM a search engine renders
// carry it. It reads the bundled manifest and the build-time counts, never storage or the network, so the
// build-time render and the first client render match.
import { DIFFICULTIES } from '@syntactical/content-schema';
import { Text, View } from 'react-native';

import { BANK_QUESTION_COUNTS } from '../../services/content/bankTitles.generated';
import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import { findLanguageEntry } from '../../services/content/findLanguageEntry';
import { PageHead } from './PageHead';

type TrackSummaryProps = { language: string };

function describeCount(count: number): string {
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

function listBankSizes(language: string, bankIds: readonly string[]) {
  return DIFFICULTIES.filter(({ id }) => bankIds.includes(id)).flatMap(({ id, label }) => {
    const count = BANK_QUESTION_COUNTS[`${language}/${id}`];
    return count === undefined ? [] : [{ count, id, label }];
  });
}

export function TrackSummary({ language }: TrackSummaryProps) {
  const entry = findLanguageEntry(BUNDLED_MANIFEST.languages, language);
  if (!entry) return null;
  const banks = listBankSizes(language, Object.keys(entry.banks));
  return (
    <View className="mt-10 gap-3">
      <PageHead
        canonicalPath={`/${language}/`}
        description={`${entry.label} quiz on Syntactical: ${entry.tagline}`}
        title={`${entry.label} quiz: Easy, Medium, Hard | Syntactical`}
      />
      <Text role="heading" aria-level={2} className="font-mono text-xs uppercase tracking-widest text-muted">
        {`About ${entry.label}`}
      </Text>
      <Text className="text-sm text-ink">{entry.tagline}</Text>
      {entry.topics.length === 0 ? null : (
        <View role="list" aria-label="Topics" className="gap-1">
          {entry.topics.map(({ id, label }) => (
            <Text key={id} role="listitem" className="text-sm text-muted">
              {label}
            </Text>
          ))}
        </View>
      )}
      <View role="list" aria-label="Banks" className="gap-1">
        {banks.map(({ count, id, label }) => (
          <Text key={id} role="listitem" className="font-mono text-sm text-muted">
            {`${label}: ${describeCount(count)}`}
          </Text>
        ))}
      </View>
    </View>
  );
}
