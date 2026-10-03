// Quality route: the numbers from the latest committed pipeline report, or an
// explicit "not audited yet" state until a report has been committed.
import type { ReactNode } from 'react';

import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { QualityStat } from '../components/quality/QualityStat';
import { QualityTable } from '../components/quality/QualityTable';
import { QUALITY_REPORT } from '../services/quality/qualityReport.generated';

const PERCENT = 100;

function formatPercent(rate: number): string {
  return `${Math.round(rate * PERCENT)}%`;
}

function Section({ children, isEmpty = false, title }: { children: ReactNode; isEmpty?: boolean; title: string }) {
  return (
    <View role="region" aria-label={title} className="mt-8">
      <Text role="heading" aria-level={2} className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
        {title}
      </Text>
      {isEmpty ? <Text className="font-mono text-sm text-muted">None recorded</Text> : <View role="list">{children}</View>}
    </View>
  );
}

function toEntries(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort(([left], [right]) => (left < right ? -1 : 1));
}

function Report({ report }: { report: NonNullable<typeof QUALITY_REPORT> }) {
  const { banks, finishedAt, runId, summary } = report;
  const { agreement, audited, auditFailuresInOriginal, humanReviewRate, methodMix, rejectedByReason } = summary;
  return (
    <View>
      <Text className="mt-2 font-mono text-xs text-muted">{`Run ${runId}, finished ${finishedAt}`}</Text>
      <Section title="Summary">
        <QualityStat label="Questions audited" value={String(audited)} />
        <QualityStat label="Audit failures in the original banks" value={String(auditFailuresInOriginal)} />
        <QualityStat label="Share needing human review (not executable)" value={formatPercent(humanReviewRate)} />
      </Section>
      <Section title="Rejected by reason" isEmpty={Object.keys(rejectedByReason).length === 0}>
        {toEntries(rejectedByReason).map(([reason, count]) => (
          <QualityStat key={reason} label={reason} value={String(count)} />
        ))}
      </Section>
      <Section title="How questions were checked" isEmpty={Object.keys(methodMix).length === 0}>
        {toEntries(methodMix).map(([method, count]) => (
          <QualityStat key={method} label={method} value={String(count)} />
        ))}
      </Section>
      <Section title="Agreement between runs" isEmpty={Object.keys(agreement).length === 0}>
        {toEntries(agreement).map(([stage, rate]) => (
          <QualityStat key={stage} label={stage} value={formatPercent(rate)} />
        ))}
      </Section>
      <View className="mt-8">
        <QualityTable banks={banks} />
      </View>
    </View>
  );
}

export default function QualityScreen() {
  return (
    <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
      <View className="w-full max-w-xl">
        <Pressable role="link" aria-label="Back to languages" onPress={() => router.replace('/')}>
          <Text className="font-mono text-xs uppercase tracking-widest text-muted">Back</Text>
        </Pressable>
        <Text role="heading" aria-level={1} className="mt-6 font-mono text-3xl text-ink">
          Content quality
        </Text>
        <Text className="mt-2 text-sm text-muted">
          Every question is checked before it ships. These are the numbers from the latest audit, including failures found in the original
          banks.
        </Text>
        {QUALITY_REPORT === null ? (
          <Text className="mt-8 font-mono text-sm text-ink">Not audited yet</Text>
        ) : (
          <Report report={QUALITY_REPORT} />
        )}
      </View>
    </ScrollView>
  );
}
