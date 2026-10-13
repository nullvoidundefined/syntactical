// The query's links to official documentation, one per line under a "Docs" heading.
import type { DocLink } from '@syntactical/content-schema';
import { Text, View } from 'react-native';

import { ExternalLink } from './ExternalLink';

export function DocLinks({ docs }: { docs: DocLink[] }) {
  return (
    <View className="mt-6 gap-2">
      <Text role="heading" aria-level={3} className="font-mono text-xs uppercase tracking-widest text-muted">
        Docs
      </Text>
      {docs.map(({ title, url }) => (
        <ExternalLink key={url} label={title} url={url} />
      ))}
    </View>
  );
}
