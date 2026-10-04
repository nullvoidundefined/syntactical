// The layout shared by the privacy policy and the account deletion page: one h1, h2 sections, and
// plain lists, as semantic roles so the web build renders real headings and lists.
import type { ReactNode } from 'react';

import { ScrollView, Text, View } from 'react-native';

export function LegalPage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
      <View className="w-full max-w-xl">
        <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
          {title}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View className="mt-8">
      <Text role="heading" aria-level={2} className="font-mono text-sm uppercase tracking-widest text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <Text className="mt-3 text-sm text-muted">{children}</Text>;
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <View role="list" className="mt-3 gap-2">
      {items.map((item) => (
        <View key={item} role="listitem" className="flex-row gap-2">
          <Text aria-hidden className="text-sm text-muted">
            {'\u2022'}
          </Text>
          <Text className="flex-1 text-sm text-muted">{item}</Text>
        </View>
      ))}
    </View>
  );
}
