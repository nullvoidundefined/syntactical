import { isRecord } from './isRecord.js';
import { isValidProvenance } from './isValidProvenance.js';

export function hasValidQuestionProvenance(question: unknown): boolean {
  if (!isRecord(question)) return false;
  const { criterion, provenance } = question;
  if (isValidProvenance(provenance)) return true;
  if (!isRecord(provenance) || !isRecord(provenance.validation)) return false;
  const { validation } = provenance;
  if (
    question.type !== 'ab' ||
    !isRecord(criterion) ||
    criterion.type !== 'readability' ||
    typeof criterion.evidence !== 'string' ||
    criterion.evidence.trim().length === 0 ||
    validation.method !== 'judged' ||
    validation.status !== 'passed' ||
    validation.evidence !== undefined
  ) {
    return false;
  }
  // The pipeline's readability judge records evidence on criterion without source URLs.
  // Check the remaining provenance fields without requiring source evidence for a passed judgment.
  return isValidProvenance({ ...provenance, validation: { ...validation, status: 'pending' } });
}
