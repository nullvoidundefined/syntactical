// The card label shown only for questions whose output was checked by
// actually running the code.
import type { Provenance } from '@syntactical/content-schema';
import { Text } from 'react-native';

type VerifiedBadgeProps = {
  provenance: Provenance;
};

export function VerifiedBadge({ provenance }: VerifiedBadgeProps) {
  const { runtimeVersion, validation } = provenance;
  const { method, status } = validation;
  if (method !== 'executed' || status !== 'passed' || !runtimeVersion) return null;
  return <Text className="mt-1 font-mono text-[11px] text-signal">{`Output verified on ${runtimeVersion}`}</Text>;
}
