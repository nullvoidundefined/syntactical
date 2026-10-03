// The per-bank audit counts as a table: one row per bank, every count labeled.
import { Text, View } from 'react-native';

import type { BankQuality } from '../../services/quality/types/BankQuality';

const COLUMNS = ['Bank', 'Audited', 'Passed', 'Failed', 'Not executable'];

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <Text role="cell" aria-label={label} className="flex-1 text-right font-mono text-sm text-ink">
      {value}
    </Text>
  );
}

export function QualityTable({ banks }: { banks: readonly BankQuality[] }) {
  return (
    <View role="table" aria-label="Audit counts by bank">
      <View role="row" className="flex-row border-b border-line py-2">
        {COLUMNS.map((column) => (
          <Text key={column} role="columnheader" className="flex-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            {column}
          </Text>
        ))}
      </View>
      {banks.map(({ audited, bankKey, failed, notExecutable, passed }) => (
        <View key={bankKey} role="row" className="flex-row border-b border-line py-2">
          <Text role="rowheader" className="flex-1 font-mono text-sm text-ink">
            {bankKey}
          </Text>
          <Cell label={`${bankKey}: ${audited} audited`} value={audited} />
          <Cell label={`${bankKey}: ${passed} passed`} value={passed} />
          <Cell label={`${bankKey}: ${failed} failed`} value={failed} />
          <Cell label={`${bankKey}: ${notExecutable} not executable`} value={notExecutable} />
        </View>
      ))}
    </View>
  );
}
